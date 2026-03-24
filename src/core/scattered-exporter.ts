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

  constructor(logger: Logger, basePath: string = process.cwd()) {
    this.logger = logger;
    this.basePath = basePath;
    this.yamlHandler = new YamlHandler();
  }

  /**
   * 扫描文件
   */
  private async scanFiles(patterns: string[], language: string): Promise<LocaleFile[]> {
    const scanner = new LocaleScanner(this.basePath, []);

    // 扫描所有文件
    const allFiles = await scanner.scan(patterns);

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
  }): Promise<ScatteredExportResult> {
    this.logger.verboseLog('\n📤 开始导出零散翻译文件...');

    // 1. 扫描基础语言和目标语言文件
    this.logger.verboseLog(`  扫描基础语言: ${options.baseLanguage}`);
    const baseFiles = await this.scanFiles(options.scanPatterns, options.baseLanguage);
    this.logger.verboseLog(`  找到 ${baseFiles.length} 个基础语言文件`);

    this.logger.verboseLog(`  扫描目标语言: ${options.targetLanguage}`);
    const targetFiles = await this.scanFiles(options.scanPatterns, options.targetLanguage);
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
   * 例如: app/shop/locales/zh-CN.yml → app/shop/locales/{locale}.yml
   */
  private normalizeFilePath(filePath: string): string {
    // 匹配类似 zh-CN, en-US 这样的语言代码
    return filePath.replace(/\/([a-z]{2}-[A-Z]{2})\.yml$/, '/{locale}.yml');
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
