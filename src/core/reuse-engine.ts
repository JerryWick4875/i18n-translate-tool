import * as path from 'path';
import * as fs from 'fs/promises';
import {
  LocaleFile,
  ReuseSuggestionsData,
  ReuseSuggestion,
  ReuseSuggestionSource,
  ReuseTranslationOptions,
  ReuseTranslationResult,
} from '../types';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import { Logger } from '../utils/logger';
import { getRelativePath, normalizePath } from '../utils/file-utils';
import { filterFilesByGlob } from '../utils/filter-utils';

interface EmptyKeyInfo {
  file: LocaleFile;
  key: string;
  baseValue: string;
}

interface TranslationMatch {
  value: string;
  source: string;
  sourceKey: string;
}

/**
 * 翻译复用引擎，用于查找和复用现有的翻译
 */
export class ReuseEngine {
  private options: ReuseTranslationOptions;
  private logger: Logger;
  private scanner: LocaleScanner;
  private yamlHandler: YamlHandler;

  constructor(options: ReuseTranslationOptions, logger?: Logger) {
    this.options = options;
    this.logger = logger || new Logger(options.verbose);
    this.scanner = new LocaleScanner(options.basePath);
    this.yamlHandler = new YamlHandler();
  }

  /**
   * 查找目标语言文件中的空键
   */
  async findEmptyKeys(
    targetFiles: LocaleFile[],
    baseFiles: LocaleFile[],
    ignoreValues: string[]
  ): Promise<EmptyKeyInfo[]> {
    const emptyKeys: EmptyKeyInfo[] = [];

    for (const targetFile of targetFiles) {
      const baseFile = baseFiles.find(
        f => f.relativePath === targetFile.relativePath.replace(
          this.options.target,
          this.options.baseLanguage || 'zh-CN'
        )
      );

      if (!baseFile) {
        continue;
      }

      for (const [key, value] of Object.entries(targetFile.content)) {
        const isEmpty = !value || value === '' || ignoreValues.includes(value);
        if (isEmpty) {
          const baseValue = baseFile.content[key];
          if (baseValue) {
            emptyKeys.push({ file: targetFile, key, baseValue });
          }
        }
      }
    }

    return emptyKeys;
  }

  /**
   * 全局搜索匹配的翻译
   */
  findMatchingTranslations(
    targetLanguage: string,
    baseValue: string,
    allTargetFiles: LocaleFile[],
    allBaseFiles: LocaleFile[]
  ): TranslationMatch[] {
    const matches: TranslationMatch[] = [];

    for (const file of allTargetFiles) {
      for (const [key, value] of Object.entries(file.content)) {
        if (value && value !== '') {
          // 获取此键的基础语言值
          const relativePath = file.relativePath.replace(
            targetLanguage,
            this.options.baseLanguage || 'zh-CN'
          );
          const baseFile = allBaseFiles.find(f => f.relativePath === relativePath);

          if (baseFile) {
            const fileBaseValue = baseFile.content[key];
            if (fileBaseValue === baseValue) {
              matches.push({
                value,
                source: file.relativePath,
                sourceKey: key,
              });
            }
          }
        }
      }
    }

    return this.deduplicateMatches(matches);
  }

  /**
   * 去重匹配结果，每个唯一翻译保留一个来源
   */
  private deduplicateMatches(matches: TranslationMatch[]): TranslationMatch[] {
    const grouped = new Map<string, TranslationMatch>();

    for (const match of matches) {
      if (!grouped.has(match.value)) {
        grouped.set(match.value, match);
      }
    }

    return Array.from(grouped.values());
  }

  /**
   * 生成翻译复用建议
   * @param skipFileWrite 跳过写入建议文件（用于一键模式）
   */
  async generateSuggestions(
    scanPatterns: string[],
    baseLanguage: string,
    outputPath?: string,
    skipFileWrite = false
  ): Promise<ReuseSuggestionsData> {
    const targetLanguage = this.options.target;
    const outputFilePath = this.resolveOutputPath(outputPath || this.options.outputPath || '.i18ntool-reuse.yml');

    this.logger.section(`\n🔍 扫描 ${targetLanguage} 中的空翻译...`);

    // 扫描所有文件
    let allFiles = await this.scanner.scan(scanPatterns);

    if (this.options.filter) {
      const filters = Array.isArray(this.options.filter)
        ? this.options.filter
        : [this.options.filter];

      allFiles = await filterFilesByGlob(allFiles, filters, this.options.basePath);
      if (allFiles.length === 0) {
        this.logger.warn(`No files found matching filters: ${filters.join(', ')}`);
        return {
          generatedAt: new Date().toISOString(),
          locale: targetLanguage,
          items: [],
        };
      }
    }

    allFiles = await this.yamlHandler.loadFiles(allFiles);

    // 分离基础语言和目标语言文件
    const baseFiles = allFiles.filter(f => f.language === baseLanguage);
    const targetFiles = allFiles.filter(f => f.language === targetLanguage);

    // 获取忽略值列表
    const ignoreValues = this.options.basePath
      ? await this.loadIgnoreValues()
      : ['(i18n-no-translate)', '-', 'TODO'];

    // 查找空键
    const emptyKeys = await this.findEmptyKeys(targetFiles, baseFiles, ignoreValues);

    if (emptyKeys.length === 0) {
      this.logger.info('No empty translations found');
      return {
        generatedAt: new Date().toISOString(),
        locale: targetLanguage,
        items: [],
      };
    }

    // 生成建议
    const suggestions: ReuseSuggestion[] = [];
    let uniqueMatches = 0;
    let multipleMatches = 0;
    let noMatches = 0;

    for (const emptyKey of emptyKeys) {
      const matches = this.findMatchingTranslations(
        targetLanguage,
        emptyKey.baseValue,
        targetFiles,
        baseFiles
      );

      if (matches.length === 1) {
        suggestions.push({
          file: emptyKey.file.relativePath,
          key: emptyKey.key,
          baseValue: emptyKey.baseValue,
          value: matches[0].value,
        });
        uniqueMatches++;
      } else if (matches.length > 1) {
        suggestions.push({
          file: emptyKey.file.relativePath,
          key: emptyKey.key,
          baseValue: emptyKey.baseValue,
          suggestions: matches.map(m => ({
            value: m.value,
            source: m.source,
            sourceKey: m.sourceKey,
          })),
        });
        multipleMatches++;
      } else {
        noMatches++;
      }
    }

    this.logger.info(`找到 ${emptyKeys.length} 个空翻译:`);
    this.logger.info(`  - ${uniqueMatches} with unique matches (auto-fill)`);
    this.logger.info(`  - ${multipleMatches} with multiple matches (user selection needed)`);
    this.logger.info(`  - ${noMatches} with no matches (skipped)`);

    // 构建建议数据
    const data: ReuseSuggestionsData = {
      generatedAt: new Date().toISOString(),
      locale: targetLanguage,
      items: suggestions,
    };

    // 写入建议文件（仅当有建议时）
    if (suggestions.length === 0) {
      this.logger.info('\nℹ️  未找到可复用的翻译，跳过文件生成');
      return data;
    }

    // 跳过文件写入（用于一键模式）
    if (skipFileWrite) {
      this.logger.verboseLog('\nℹ️  跳过建议文件生成（一键模式）');
      return data;
    }

    if (!this.options.dryRun) {
      // 检查文件是否存在
      const fileExists = await this.fileExists(outputFilePath);
      if (fileExists && !this.options.force) {
        throw new Error(
          `建议文件已存在: ${outputFilePath}\n使用 --force 强制覆盖`
        );
      }

      await this.writeSuggestionsFile(outputFilePath, data);
      this.logger.success(`\n✅ Suggestions written to ${outputFilePath}`);
    } else {
      this.logger.dryRun(`Would write suggestions to ${outputFilePath}`);
    }

    return data;
  }

  /**
   * 解析输出路径为绝对路径
   * 如果是相对路径，则相对于 basePath
   */
  private resolveOutputPath(outputPath: string): string {
    if (path.isAbsolute(outputPath)) {
      return outputPath;
    }
    return path.resolve(this.options.basePath, outputPath);
  }

  /**
   * 从配置加载忽略值列表
   */
  private async loadIgnoreValues(): Promise<string[]> {
    // 这里暂时返回默认值，实际应该从配置文件加载
    return ['(i18n-no-translate)', '-', 'TODO'];
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 写入建议文件
   */
  private async writeSuggestionsFile(
    filePath: string,
    data: ReuseSuggestionsData
  ): Promise<void> {
    const lines: string[] = [
      '# i18n-translate-tool 翻译复用建议文件',
      `# 生成时间: ${data.generatedAt}`,
      `# 目标语言: ${data.locale}`,
      '#',
      '# 使用说明:',
      '# - value 字段: 直接填充此翻译',
      '# - suggestions 字段: 从多个选项中选择一个填入 value 字段',
      '# - 留空 value: 跳过此项翻译',
      '',
      `generatedAt: "${data.generatedAt}"`,
      `locale: "${data.locale}"`,
      '',
      'items:',
    ];

    for (const item of data.items) {
      lines.push(`  # 文件: ${item.file}`);
      lines.push(`  # 基础值: ${item.baseValue}`);
      lines.push(`  - file: "${item.file}"`);
      lines.push(`    key: "${item.key}"`);
      lines.push(`    baseValue: "${item.baseValue}"`);

      if (item.value !== undefined) {
        lines.push(`    value: "${item.value}"`);
      }

      if (item.suggestions && item.suggestions.length > 0) {
        lines.push('    # 多个匹配选项，请选择一个:');
        lines.push('    suggestions:');
        for (const suggestion of item.suggestions) {
          lines.push(`      - value: "${suggestion.value}"`);
          lines.push(`        source: "${suggestion.source}"`);
          lines.push(`        sourceKey: "${suggestion.sourceKey}"`);
        }
      }

      lines.push('');
    }

    const content = lines.join('\n');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 应用翻译建议
   */
  async applyTranslations(
    suggestionsData: ReuseSuggestionsData,
    dryRun = false
  ): Promise<ReuseTranslationResult> {
    const result: ReuseTranslationResult = {
      filledCount: 0,
      skippedCount: 0,
      multipleMatchesCount: 0,
      fileCount: 0,
    };

    // 按文件分组建议
    const fileGroups = new Map<string, ReuseSuggestion[]>();

    for (const item of suggestionsData.items) {
      let items = fileGroups.get(item.file);
      if (!items) {
        items = [];
        fileGroups.set(item.file, items);
      }
      items.push(item);
    }

    // 处理每个文件
    for (const [relativePath, items] of fileGroups) {
      const filePath = path.join(this.options.basePath, relativePath);

      try {
        const content = await this.yamlHandler.loadFile(filePath);
        let fileModified = false;

        for (const item of items) {
          if (item.value) {
            content[item.key] = item.value;
            result.filledCount++;
            fileModified = true;
            this.logger.logFilledKey(item.key, item.value, relativePath);
          } else if (item.suggestions && item.suggestions.length > 0) {
            result.multipleMatchesCount++;
            this.logger.logMultipleMatches(item.key, relativePath);
          } else {
            result.skippedCount++;
            this.logger.logSkippedKey(item.key, relativePath);
          }
        }

        if (fileModified && !dryRun) {
          // 保持原始键顺序
          const keyOrder = Object.keys(content);
          await this.yamlHandler.writeFile(filePath, content, keyOrder);
          result.fileCount++;
        } else if (fileModified && dryRun) {
          result.fileCount++;
          this.logger.dryRun(`Would update ${relativePath}`);
        }
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`Failed to process ${relativePath}: ${error.message}`);
        }
      }
    }

    return result;
  }

  /**
   * 一键模式：生成并立即应用唯一匹配的翻译
   */
  async generateAndApply(
    scanPatterns: string[],
    baseLanguage: string,
    dryRun = false
  ): Promise<ReuseTranslationResult> {
    this.logger.section(`\n🚀 One-time mode: Generating and applying translations...`);

    // 生成建议（内存中，不写入文件）
    const suggestions = await this.generateSuggestions(
      scanPatterns,
      baseLanguage,
      undefined,  // outputPath
      true        // skipFileWrite
    );

    // 过滤出有唯一匹配的建议
    const uniqueMatches = suggestions.items.filter(
      item => item.value !== undefined && item.value !== ''
    );

    if (uniqueMatches.length === 0) {
      this.logger.info('No unique matches found to apply');
      return {
        filledCount: 0,
        skippedCount: 0,
        multipleMatchesCount: suggestions.items.filter(
          item => item.suggestions && item.suggestions.length > 0
        ).length,
        fileCount: 0,
      };
    }

    this.logger.info(`Applying ${uniqueMatches.length} unique matches...`);

    // 创建仅包含唯一匹配的数据
    const uniqueData: ReuseSuggestionsData = {
      generatedAt: suggestions.generatedAt,
      locale: suggestions.locale,
      items: uniqueMatches,
    };

    // 应用翻译
    const result = await this.applyTranslations(uniqueData, dryRun);

    // 报告跳过的项目
    const skippedCount = suggestions.items.length - uniqueMatches.length;
    if (skippedCount > 0) {
      this.logger.info(`Skipped ${skippedCount} items (multiple matches or no matches)`);
    }

    return result;
  }

  /**
   * 从文件读取建议数据
   */
  async readSuggestionsFile(filePath: string): Promise<ReuseSuggestionsData> {
    const content = await fs.readFile(filePath, 'utf-8');
    const yaml = require('js-yaml');
    return yaml.load(content) as ReuseSuggestionsData;
  }
}

/**
 * 扩展 Logger 以支持翻译复用的日志方法
 */
declare module '../utils/logger' {
  interface Logger {
    logFilledKey(key: string, value: string, filePath: string): void;
    logMultipleMatches(key: string, filePath: string): void;
    logSkippedKey(key: string, filePath: string): void;
    reuseSummary(filled: number, skipped: number, multiple: number): void;
  }
}

Logger.prototype.logFilledKey = function(key: string, value: string, filePath: string): void {
  if (!(this as any).silent) {
    console.log(`  [填充] ${key}: "${value}" (${filePath})`);
  }
};

Logger.prototype.logMultipleMatches = function(key: string, filePath: string): void {
  if (!(this as any).silent) {
    console.log(`  [多选] ${key} (${filePath})`);
  }
};

Logger.prototype.logSkippedKey = function(key: string, filePath: string): void {
  if (!(this as any).silent) {
    console.log(`  [跳过] ${key} (${filePath})`);
  }
};

Logger.prototype.reuseSummary = function(filled: number, skipped: number, multiple: number): void {
  if (!(this as any).silent) {
    console.log(`\n摘要: ${filled} 个已填充, ${multiple} 个多选, ${skipped} 个跳过`);
  }
};
