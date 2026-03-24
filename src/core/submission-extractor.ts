import * as path from 'path';
import * as fs from 'fs/promises';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import { Logger } from '../utils/logger';
import { ensureDir, normalizePath } from '../utils/file-utils';
import { filterFilesByGlob } from '../utils/filter-utils';
import {
  I18nConfig,
  SubmissionOptions,
  ExtractionResult,
  ExtractedFile,
  LocaleFile,
} from '../types';
import { DeduplicationCollector } from './deduplication-collector';
import { MappingFileGenerator } from './mapping-file-generator';

/**
 * 提取未翻译条目的配置
 */
interface ExtractionConfig {
  baseLanguage: string;
  targetLanguage: string;
  outputDir: string;
  filter?: string | string[];
  outputFormat?: {
    quotingType?: string;
    forceQuotes?: boolean;
    indent?: number;
  };
}

/**
 * 提取未翻译的翻译条目
 */
export class SubmissionExtractor {
  private scanner: LocaleScanner;
  private yamlHandler: YamlHandler;
  private logger: Logger;
  private config: I18nConfig;
  private basePath: string;
  private filter?: string | string[];
  private deduplication?: boolean;

  constructor(options: SubmissionOptions, config: I18nConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.basePath = options.basePath;
    this.filter = options.filter;
    this.deduplication = options.deduplication;
    this.scanner = new LocaleScanner(options.basePath, config.scanPatterns);
    this.yamlHandler = new YamlHandler();
  }

  /**
   * 提取未翻译的条目
   */
  async extract(
    scanPatterns: string[],
    baseLanguage: string,
    targetLanguage: string,
    outputDir: string
  ): Promise<ExtractionResult> {
    this.logger.section('\n📦 开始提取待翻译词条...');

    // 扫描文件
    const files = await this.scanner.scan(scanPatterns);
    this.logger.verboseLog(`扫描到 ${files.length} 个文件`);

    // 过滤文件（如果指定了过滤器）
    const filteredFiles = await this.filterFiles(files, this.filter);
    this.logger.verboseLog(`过滤后 ${filteredFiles.length} 个文件`);

    // 加载文件内容
    const loadedFiles = await this.yamlHandler.loadFiles(filteredFiles);
    this.logger.verboseLog(`成功加载 ${loadedFiles.length} 个文件`);

    // 按应用和语言分组
    const groups = this.scanner.groupByAppAndLanguage(loadedFiles);

    // 收集所有未翻译的条目（不立即写入）
    const allUntranslatedEntries = new Map<string, Map<string, string>>();

    for (const group of groups) {
      this.logger.verboseLog(`\n处理应用: ${group.app}`);

      const baseFiles = group.languages[baseLanguage] || [];
      const targetFiles = group.languages[targetLanguage] || [];

      this.logger.verboseLog(`  基础语言文件: ${baseFiles.length}`);
      this.logger.verboseLog(`  目标语言文件: ${targetFiles.length}`);

      // 为每个目标文件查找匹配的基础文件
      for (const targetFile of targetFiles) {
        this.logger.verboseLog(`  处理目标文件: ${targetFile.relativePath}`);
        const baseFile = this.findMatchingFile(targetFile, baseFiles);

        if (!baseFile) {
          this.logger.verboseLog(`    跳过: ${targetFile.relativePath} (未找到对应的基础语言文件)`);
          continue;
        }

        this.logger.verboseLog(`    匹配的基础文件: ${baseFile.relativePath}`);

        // 查找未翻译的条目
        const untranslatedEntries = this.findUntranslatedEntries(baseFile, targetFile);

        if (untranslatedEntries.size === 0) {
          this.logger.verboseLog(`    跳过: ${targetFile.relativePath} (所有条目已翻译)`);
          continue;
        }

        this.logger.verboseLog(`    收集: ${targetFile.relativePath} (${untranslatedEntries.size} 个未翻译条目)`);

        // 收集条目（暂不写入）
        allUntranslatedEntries.set(targetFile.relativePath, untranslatedEntries);
      }
    }

    // 应用去重（如果启用）
    let finalEntries = allUntranslatedEntries;
    let dedupedEntries: any[] | undefined;

    if (this.deduplication && allUntranslatedEntries.size > 0) {
      const collector = new DeduplicationCollector(this.logger);
      dedupedEntries = collector.collect(allUntranslatedEntries);

      // 转换回文件格式（只包含主键）
      finalEntries = this.convertDedupedToFiles(dedupedEntries);
    }

    // 写入文件
    const extractedFiles: ExtractedFile[] = [];
    let totalEntryCount = 0;

    for (const [filePath, entries] of finalEntries.entries()) {
      if (entries.size === 0) {
        continue; // 跳过空文件
      }

      // 创建输出文件路径（保持与项目结构一致，将目标语言替换为基础语言）
      const baseOutputPath = path.join(outputDir, filePath.replace(targetLanguage, baseLanguage));
      const targetOutputPath = path.join(outputDir, filePath);

      // 确保输出目录存在
      await ensureDir(path.dirname(baseOutputPath));
      await ensureDir(path.dirname(targetOutputPath));

      // 写入基础语言文件
      const baseContent = Object.fromEntries(entries);
      await this.yamlHandler.writeFile(baseOutputPath, baseContent);

      // 写入目标语言文件（空值）
      const targetContent: Record<string, string> = {};
      for (const key of entries.keys()) {
        targetContent[key] = '';
      }
      await this.yamlHandler.writeFile(targetOutputPath, targetContent);

      // 记录提取的文件
      extractedFiles.push({
        relativePath: filePath,
        baseLanguage,
        targetLanguage,
        entryCount: entries.size,
      });

      totalEntryCount += entries.size;
    }

    // 写入映射文件（如果启用去重）
    if (this.deduplication && dedupedEntries && dedupedEntries.length > 0) {
      const mappingFileName = this.config.submission?.deduplication?.mappingFileName || '_translation-mapping.yml';
      const mappingFilePath = path.join(outputDir, mappingFileName);
      const mapping = new DeduplicationCollector(this.logger).generateMapping(dedupedEntries);

      const generator = new MappingFileGenerator(this.logger);
      await generator.writeFile(mappingFilePath, mapping);
      generator.logSummary(mapping);
    }

    this.logger.success(`\n✅ 提取完成: ${extractedFiles.length} 个文件, ${totalEntryCount} 个词条`);

    return {
      fileCount: extractedFiles.length,
      entryCount: totalEntryCount,
      files: extractedFiles,
    };
  }

  /**
   * 将去重后的条目转换回文件格式
   */
  private convertDedupedToFiles(dedupedEntries: any[]): Map<string, Map<string, string>> {
    const files = new Map<string, Map<string, string>>();

    for (const entry of dedupedEntries) {
      // 只使用主键
      const filePath = entry.primaryKey.file;
      const key = entry.primaryKey.key;
      const baseValue = entry.baseValue;

      if (!files.has(filePath)) {
        files.set(filePath, new Map());
      }

      files.get(filePath)!.set(key, baseValue);
    }

    return files;
  }

  /**
   * 过滤文件
   */
  private async filterFiles(files: LocaleFile[], filter?: string | string[]): Promise<LocaleFile[]> {
    if (!filter) {
      return files;
    }

    const filters = Array.isArray(filter) ? filter : [filter];
    return filterFilesByGlob(files, filters, this.basePath);
  }

  /**
   * 查找匹配的基础语言文件
   */
  private findMatchingFile(targetFile: LocaleFile, baseFiles: LocaleFile[]): LocaleFile | undefined {
    // 获取目标文件的文件名（不含扩展名）
    const targetBaseName = path.basename(targetFile.relativePath, path.extname(targetFile.relativePath));

    // 获取目标文件的目录，并将语言代码替换为基础语言
    const targetDir = path.dirname(targetFile.relativePath);

    // 首先尝试：查找文件名相同的基础语言文件
    let baseFile = baseFiles.find(f => {
      const baseBaseName = path.basename(f.relativePath, path.extname(f.relativePath));
      const baseDir = path.dirname(f.relativePath);

      // 检查文件名是否相同
      if (baseBaseName !== targetBaseName) {
        return false;
      }

      // 检查目录结构是否匹配（通过比较去除语言代码后的路径）
      // 例如：app/shop/config/products/widget/locales/en-US
      //       应该匹配 app/shop/config/products/widget/locales/zh-CN
      const targetPathParts = normalizePath(targetDir).split('/');
      const basePathParts = normalizePath(baseDir).split('/');

      // 如果路径长度相同，且除了语言代码部分外都相同，则匹配
      if (targetPathParts.length === basePathParts.length) {
        for (let i = 0; i < targetPathParts.length; i++) {
          // 如果路径部分不同
          if (targetPathParts[i] !== basePathParts[i]) {
            // 检查是否可能是语言代码（格式如：en, zh, en-US, zh-Hans）
            // 语言代码格式：2个字母，可选后跟 - 和更多字母
            const langCodePattern = /^[a-zA-Z]{2}(-[a-zA-Z]+)?$/;
            const targetLooksLikeLang = langCodePattern.test(targetPathParts[i]);
            const baseLooksLikeLang = langCodePattern.test(basePathParts[i]);

            // 如果两边都看起来像语言代码，则跳过比较（认为是语言代码差异）
            if (targetLooksLikeLang && baseLooksLikeLang) {
              continue;
            }

            // 否则认为不匹配
            return false;
          }
        }
        return true;
      }

      return false;
    });

    return baseFile;
  }

  /**
   * 查找未翻译的条目
   */
  private findUntranslatedEntries(
    baseFile: LocaleFile,
    targetFile: LocaleFile
  ): Map<string, string> {
    const untranslated = new Map<string, string>();

    for (const [key, baseValue] of Object.entries(baseFile.content)) {
      const targetValue = targetFile.content[key];

      // 如果目标值不存在或为空，则认为是未翻译（保持原始值，不进行 trim）
      if (targetValue === undefined || targetValue === '') {
        untranslated.set(key, baseValue);
      }
    }

    return untranslated;
  }

  /**
   * 检查输出目录是否存在
   */
  static async checkOutputDir(outputDir: string): Promise<boolean> {
    try {
      await fs.access(outputDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清空输出目录
   */
  static async clearOutputDir(outputDir: string): Promise<void> {
    await fs.rm(outputDir, { recursive: true, force: true });
  }

  /**
   * 获取输出目录中的所有文件
   */
  static async getOutputFiles(outputDir: string): Promise<string[]> {
    const { glob } = await import('glob');
    const pattern = path.join(outputDir, '**/*.yml');
    return await glob(pattern, { absolute: true });
  }
}
