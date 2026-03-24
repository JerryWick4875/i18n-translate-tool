import { LocaleFile, KeyLocation } from '../types';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 去重条目（用于零散翻译导出）
 */
interface ScatteredDedupedEntry {
  baseValue: string;
  keyLocations: KeyLocation[];
}

/**
 * 导出结果
 */
interface ScatteredExportResult {
  allKeys: KeyLocation[];
  dedupedEntries: ScatteredDedupedEntry[];
  filePath: string;
  totalCount: number;
  uniqueCount: number;
}

/**
 * 零散翻译导出器
 * 负责提取需要翻译的 key，去重后生成指定格式的文件
 */
export class ScatteredExporter {
  private logger: Logger;
  private basePath: string;
  private yamlHandler: YamlHandler;
  private localeReplacePattern: RegExp | null = null;

  constructor(logger: Logger, basePath: string = process.cwd()) {
    this.logger = logger;
    this.basePath = basePath;
    this.yamlHandler = new YamlHandler();
  }

  /**
   * 初始化 locale 替换模式
   * 根据 scanPatterns 中 (* as locale) 的位置，构建用于替换语言代码的正则表达式
   */
  private initLocaleReplacePattern(scanPatterns: string[]): void {
    for (const pattern of scanPatterns) {
      // 查找 (* as locale) 在 pattern 中的位置
      const localeMatch = pattern.match(/\(\*\s+as\s+locale\)/);
      if (!localeMatch) continue;

      const localeIndex = localeMatch.index!;
      const beforeLocale = pattern.slice(0, localeIndex);
      const afterLocale = pattern.slice(localeIndex + localeMatch[0].length);

      // 根据 locale 前后的内容决定使用哪种正则模式：
      // - 如果 beforeLocale 为空，说明是根文件: (* as locale).yml
      // - 如果 afterLocale 是 .yml 且没有 /，说明是文件名: xxx/(* as locale).yml
      // - 如果 afterLocale 以 / 开头，说明是目录: xxx/(* as locale)/xxx
      if (beforeLocale === '' && afterLocale === '.yml') {
        // 根文件格式: (* as locale).yml
        this.localeReplacePattern = /^([a-z]{2}-[A-Z]{2})\.yml$/;
      } else if (afterLocale.endsWith('.yml') && !afterLocale.includes('/')) {
        // 文件名格式: xxx/(* as locale).yml
        this.localeReplacePattern = /\/([a-z]{2}-[A-Z]{2})\.yml$/;
      } else if (afterLocale.startsWith('/')) {
        // 目录格式: xxx/(* as locale)/xxx
        this.localeReplacePattern = /\/([a-z]{2}-[A-Z]{2})\//;
      } else {
        // 其他格式，尝试通用匹配
        this.localeReplacePattern = /\/([a-z]{2}-[A-Z]{2})(\/|\.yml$)/;
      }

      return;
    }

    // 如果没有找到 (* as locale)，使用默认模式
    this.localeReplacePattern = /\/([a-z]{2}-[A-Z]{2})\//;
  }

  /**
   * 扫描文件
   */
  private async scanFiles(patterns: string[], language: string, filterPatterns?: string[]): Promise<LocaleFile[]> {
    const scanner = new LocaleScanner(this.basePath, []);

    // 扫描所有文件
    let allFiles = await scanner.scan(patterns);

    // 如果有 filter，取 glob 交集
    if (filterPatterns && filterPatterns.length > 0) {
      const filterPaths = new Set<string>();
      for (const filterPattern of filterPatterns) {
        // 直接使用 glob 库，不通过 LocaleScanner
        const { glob } = await import('glob');
        const absolutePattern = path.isAbsolute(filterPattern)
          ? filterPattern
          : path.join(this.basePath, filterPattern);
        const matches = await glob(absolutePattern, { absolute: true, nodir: true });
        matches.forEach(m => filterPaths.add(m));
      }
      // 只保留在 filter 结果中的文件
      allFiles = allFiles.filter(f => filterPaths.has(f.path));
    }

    // 过滤出指定语言的文件
    const languageFiles = allFiles.filter(file => file.language === language);

    // 加载文件内容
    const loadedFiles = await this.yamlHandler.loadFiles(languageFiles);

    return loadedFiles;
  }

  /**
   * 导出零散翻译文件
   */
  async export(options: {
    scanPatterns: string[];
    baseLanguage: string;
    targetLanguage: string;
    outputPath: string;
    filterPatterns?: string[];
  }): Promise<ScatteredExportResult> {
    // 初始化 locale 替换模式
    this.initLocaleReplacePattern(options.scanPatterns);

    this.logger.verboseLog('\n📤 开始导出零散翻译文件...');

    // 1. 扫描基础语言和目标语言文件
    this.logger.verboseLog(`  扫描基础语言: ${options.baseLanguage}`);
    const baseFiles = await this.scanFiles(options.scanPatterns, options.baseLanguage, options.filterPatterns);
    this.logger.verboseLog(`  找到 ${baseFiles.length} 个基础语言文件`);

    this.logger.verboseLog(`  扫描目标语言: ${options.targetLanguage}`);
    const targetFiles = await this.scanFiles(options.scanPatterns, options.targetLanguage, options.filterPatterns);
    this.logger.verboseLog(`  找到 ${targetFiles.length} 个目标语言文件`);

    // 2. 提取需要翻译的 key
    const entries = this.extractEntries(baseFiles, targetFiles);
    const totalKeys = Array.from(entries.values()).reduce((sum, keys) => sum + keys.size, 0);
    this.logger.verboseLog(`  提取到 ${totalKeys} 个需要翻译的 key`);

    // 3. 去重
    const dedupedEntries = this.deduplicateEntries(entries);
    this.logger.verboseLog(`  去重后: ${dedupedEntries.length} 个唯一词条`);

    // 4. 收集所有 key
    const allKeys: KeyLocation[] = [];
    for (const [filePath, keys] of entries.entries()) {
      for (const key of keys.keys()) {
        allKeys.push({ file: filePath, key });
      }
    }
    // 按 file:key 排序
    allKeys.sort((a, b) => `${a.file}:${a.key}`.localeCompare(`${b.file}:${b.key}`));

    // 5. 生成输出文件内容
    const content = this.generateOutput(
      allKeys,
      dedupedEntries,
      options.baseLanguage,
      options.targetLanguage
    );

    // 6. 写入文件
    const outputDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(options.outputPath, content, 'utf-8');

    const result: ScatteredExportResult = {
      allKeys,
      dedupedEntries,
      filePath: options.outputPath,
      totalCount: totalKeys,
      uniqueCount: dedupedEntries.length,
    };

    this.logger.verboseLog(`\n✅ 导出完成:`);
    this.logger.verboseLog(`  总 key 数: ${result.totalCount}`);
    this.logger.verboseLog(`  唯一词条: ${result.uniqueCount}`);
    this.logger.verboseLog(`  文件路径: ${result.filePath}`);

    return result;
  }

  /**
   * 提取需要翻译的条目
   * 对比基础语言和目标语言，找出目标语言中为空的 key
   */
  private extractEntries(
    baseFiles: LocaleFile[],
    targetFiles: LocaleFile[]
  ): Map<string, Map<string, string>> {
    const entries = new Map<string, Map<string, string>>();

    // 构建目标语言文件的内容映射
    // 使用不包含语言代码的路径作为键（将语言代码替换为占位符）
    const targetContentMap = new Map<string, Map<string, string>>();
    for (const file of targetFiles) {
      const normalizedPath = this.normalizeFilePath(file.relativePath);
      targetContentMap.set(normalizedPath, new Map(Object.entries(file.content)));
    }

    // 遍历基础语言文件，找出需要翻译的 key
    for (const baseFile of baseFiles) {
      const normalizedPath = this.normalizeFilePath(baseFile.relativePath);
      const targetFileContent = targetContentMap.get(normalizedPath);
      if (!targetFileContent) {
        // 目标语言文件不存在，所有 key 都需要翻译
        for (const [key, value] of Object.entries(baseFile.content)) {
          if (!entries.has(baseFile.relativePath)) {
            entries.set(baseFile.relativePath, new Map());
          }
          entries.get(baseFile.relativePath)!.set(key, value);
        }
        continue;
      }

      // 检查每个 key
      for (const [key, value] of Object.entries(baseFile.content)) {
        const targetValue = targetFileContent.get(key);
        if (!targetValue || targetValue === '') {
          // 目标语言中为空，需要翻译
          if (!entries.has(baseFile.relativePath)) {
            entries.set(baseFile.relativePath, new Map());
          }
          entries.get(baseFile.relativePath)!.set(key, value);
        }
      }
    }

    return entries;
  }

  /**
   * 标准化文件路径，将语言代码替换为占位符以便匹配
   * 根据 scanPatterns 中 (* as locale) 的位置动态处理
   */
  private normalizeFilePath(filePath: string): string {
    if (!this.localeReplacePattern) {
      return filePath;
    }

    // 使用初始化好的模式替换语言代码
    // 根据匹配的模式决定替换格式
    return filePath.replace(this.localeReplacePattern, (match, locale, suffix) => {
      // 检查是否是根文件格式（路径中没有 /）
      if (!filePath.includes('/')) {
        // 根文件: zh-CN.yml -> {locale}.yml
        return '{locale}.yml';
      }
      // suffix 可能是 '/' 或 '.yml'
      if (suffix === '.yml') {
        return '/{locale}.yml';
      } else {
        return '/{locale}/';
      }
    });
  }

  /**
   * 去重条目
   * 按基础语言值分组，每组保留所有 key 位置
   */
  private deduplicateEntries(
    entries: Map<string, Map<string, string>>
  ): ScatteredDedupedEntry[] {
    const valueGroups = new Map<string, KeyLocation[]>();

    for (const [filePath, keys] of entries.entries()) {
      for (const [key, baseValue] of keys.entries()) {
        if (!valueGroups.has(baseValue)) {
          valueGroups.set(baseValue, []);
        }
        valueGroups.get(baseValue)!.push({ file: filePath, key });
      }
    }

    // 转换为去重条目数组
    const dedupedEntries: ScatteredDedupedEntry[] = [];
    for (const [baseValue, locations] of valueGroups.entries()) {
      // 按 file:key 排序
      locations.sort((a, b) => `${a.file}:${a.key}`.localeCompare(`${b.file}:${b.key}`));
      dedupedEntries.push({
        baseValue,
        keyLocations: locations,
      });
    }

    // 按 baseValue 排序
    dedupedEntries.sort((a, b) => a.baseValue.localeCompare(b.baseValue));

    return dedupedEntries;
  }

  /**
   * 生成输出文件内容
   */
  private generateOutput(
    allKeys: KeyLocation[],
    dedupedEntries: ScatteredDedupedEntry[],
    baseLanguage: string,
    targetLanguage: string
  ): string {
    const lines: string[] = [];

    // Keys 部分
    lines.push('===== Keys =====');
    for (const keyLocation of allKeys) {
      lines.push(`${keyLocation.file}:${keyLocation.key}`);
    }
    lines.push('===== Keys =====');
    lines.push('');

    // 基础语言部分
    lines.push(`===== ${baseLanguage} =====`);
    for (const entry of dedupedEntries) {
      lines.push(entry.baseValue);
    }
    lines.push(`===== ${baseLanguage} =====`);
    lines.push('');

    // 目标语言部分（空）
    lines.push(`===== ${targetLanguage} =====`);
    lines.push(`===== ${targetLanguage} =====`);

    return lines.join('\n');
  }
}
