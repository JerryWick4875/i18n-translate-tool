import { LocaleFile, KeyLocation } from '../types';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 解析结果
 */
interface ParsedScatteredFile {
  allKeys: KeyLocation[];
  baseValues: string[];
  targetValues: string[];
}

/**
 * 零散翻译导入器
 * 负责解析零散翻译文件，将翻译填充到目标语言文件
 */
export class ScatteredImporter {
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
   * 导入零散翻译文件
   */
  async import(options: {
    inputPath: string;
    scanPatterns: string[];
    baseLanguage: string;
    targetLanguage: string;
    dryRun?: boolean;
  }): Promise<{ updatedCount: number; fileCount: number }> {
    this.logger.verboseLog('\n📥 开始导入零散翻译文件...');

    // 1. 解析输入文件
    const content = fs.readFileSync(options.inputPath, 'utf-8');
    const parsed = this.parseFile(content, options.baseLanguage, options.targetLanguage);

    this.logger.verboseLog(`  解析到 ${parsed.allKeys.length} 个 key`);
    this.logger.verboseLog(`  基础语言词条: ${parsed.baseValues.length}`);
    this.logger.verboseLog(`  目标语言词条: ${parsed.targetValues.length}`);

    // 2. 扫描基础语言和目标语言文件
    this.logger.verboseLog(`  扫描基础语言: ${options.baseLanguage}`);
    const baseFiles = await this.scanFiles(options.scanPatterns, options.baseLanguage);

    this.logger.verboseLog(`  扫描目标语言: ${options.targetLanguage}`);
    const targetFiles = await this.scanFiles(options.scanPatterns, options.targetLanguage);

    // 3. 应用翻译
    const result = await this.applyTranslations(
      parsed,
      baseFiles,
      targetFiles,
      options.dryRun || false
    );

    this.logger.verboseLog(`\n✅ 导入完成:`);
    this.logger.verboseLog(`  更新文件: ${result.fileCount}`);
    this.logger.verboseLog(`  更新 key: ${result.updatedCount}`);

    return result;
  }

  /**
   * 解析输入文件
   */
  private parseFile(content: string, baseLanguage: string, targetLanguage: string): ParsedScatteredFile {
    const lines = content.split('\n');
    const result: ParsedScatteredFile = {
      allKeys: [],
      baseValues: [],
      targetValues: [],
    };

    let keysStart = -1;
    let keysEnd = -1;
    let baseStart = -1;
    let baseEnd = -1;
    let targetStart = -1;
    let targetEnd = -1;

    // 找到各部分的起止位置
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.startsWith('===== Keys =====')) {
        if (keysStart === -1) {
          keysStart = i + 1;
        } else {
          keysEnd = i;
        }
        i++;
      } else if (line.startsWith('===== ') && line.endsWith(' =====')) {
        // 提取语言代码
        const lang = line.slice(6, -6);

        // 找到对应的结束标记
        const sectionStart = i + 1;
        let sectionEnd = -1;
        for (let j = sectionStart; j < lines.length; j++) {
          const endLine = lines[j].trim();
          if (endLine === line) {
            sectionEnd = j;
            break;
          }
        }

        if (sectionEnd === -1) {
          sectionEnd = lines.length;
        }

        // 根据语言代码分配到基础语言或目标语言
        if (lang === baseLanguage) {
          baseStart = sectionStart;
          baseEnd = sectionEnd;
        } else if (lang === targetLanguage) {
          targetStart = sectionStart;
          targetEnd = sectionEnd;
        }

        i = sectionEnd + 1;
      } else {
        i++;
      }
    }

    // 解析 Keys 部分
    if (keysStart !== -1 && keysEnd !== -1) {
      for (let j = keysStart; j < keysEnd; j++) {
        const line = lines[j].trim();
        if (line && !line.startsWith('#')) {
          const colonIndex = line.lastIndexOf(':');
          if (colonIndex !== -1) {
            const file = line.substring(0, colonIndex);
            const key = line.substring(colonIndex + 1);
            result.allKeys.push({ file, key });
          }
        }
      }
    }

    // 解析基础语言部分
    if (baseStart !== -1 && baseEnd !== -1) {
      for (let j = baseStart; j < baseEnd; j++) {
        const line = lines[j].trim();
        if (line && !line.startsWith('#')) {
          result.baseValues.push(line);
        }
      }
    }

    // 解析目标语言部分
    if (targetStart !== -1 && targetEnd !== -1) {
      for (let j = targetStart; j < targetEnd; j++) {
        const line = lines[j].trim();
        if (line && !line.startsWith('#')) {
          result.targetValues.push(line);
        }
      }
    }

    // 验证
    if (result.baseValues.length !== result.targetValues.length) {
      throw new Error(
        `基础语言和目标语言词条数量不一致: ${result.baseValues.length} vs ${result.targetValues.length}`
      );
    }

    return result;
  }

  /**
   * 应用翻译到目标文件
   */
  private async applyTranslations(
    parsed: ParsedScatteredFile,
    baseFiles: LocaleFile[],
    targetFiles: LocaleFile[],
    dryRun: boolean
  ): Promise<{ updatedCount: number; fileCount: number }> {
    // 构建基础语言值到目标语言值的映射
    const valueToTranslation = new Map<string, string>();
    for (let i = 0; i < parsed.baseValues.length; i++) {
      const baseValue = parsed.baseValues[i];
      const targetValue = parsed.targetValues[i];
      if (targetValue && targetValue !== '') {
        valueToTranslation.set(baseValue, targetValue);
      }
    }

    // 构建目标语言文件映射（使用标准化路径）
    const targetFileMap = new Map<string, LocaleFile>();
    for (const file of targetFiles) {
      const normalizedPath = this.normalizeFilePath(file.relativePath);
      targetFileMap.set(normalizedPath, file);
    }

    // 构建基础语言文件内容映射（使用标准化路径）
    const baseContentMap = new Map<string, Record<string, string>>();
    for (const file of baseFiles) {
      const normalizedPath = this.normalizeFilePath(file.relativePath);
      baseContentMap.set(normalizedPath, file.content);
    }

    let updatedCount = 0;
    const updatedFiles = new Set<string>();

    // 遍历所有需要处理的 key
    for (const keyLocation of parsed.allKeys) {
      const normalizedFilePath = this.normalizeFilePath(keyLocation.file);
      const targetFile = targetFileMap.get(normalizedFilePath);
      if (!targetFile) {
        this.logger.verboseLog(`  ⚠ 跳过: 找不到目标文件 ${keyLocation.file}`);
        continue;
      }

      const baseContent = baseContentMap.get(normalizedFilePath);
      if (!baseContent) {
        this.logger.verboseLog(`  ⚠ 跳过: 找不到基础语言文件 ${keyLocation.file}`);
        continue;
      }

      const baseValue = baseContent[keyLocation.key];
      if (!baseValue) {
        this.logger.verboseLog(`  ⚠ 跳过: 基础语言中不存在 key ${keyLocation.file}:${keyLocation.key}`);
        continue;
      }

      const translation = valueToTranslation.get(baseValue);
      if (!translation) {
        this.logger.verboseLog(`  ⚠ 跳过: 找不到 "${baseValue}" 的翻译`);
        continue;
      }

      // 检查目标语言中的当前值
      const currentValue = targetFile.content[keyLocation.key];
      if (currentValue && currentValue !== '' && currentValue !== translation) {
        this.logger.verboseLog(
          `  ⚠ 跳过: ${keyLocation.file}:${keyLocation.key} 已有翻译 "${currentValue}"，跳过更新为 "${translation}"`
        );
        continue;
      }

      // 更新翻译
      if (!dryRun) {
        targetFile.content[keyLocation.key] = translation;
      }
      updatedCount++;
      updatedFiles.add(targetFile.path);

      if (dryRun) {
        this.logger.verboseLog(`  [DRY RUN] ${keyLocation.file}:${keyLocation.key} = "${translation}"`);
      }
    }

    // 写入文件
    if (!dryRun && updatedFiles.size > 0) {
      for (const file of targetFiles) {
        if (updatedFiles.has(file.path)) {
          await this.yamlHandler.writeFile(file.path, file.content);
        }
      }
    }

    return {
      updatedCount,
      fileCount: updatedFiles.size,
    };
  }

  /**
   * 标准化文件路径，将语言代码替换为占位符以便匹配
   * 例如: app/shop/locales/zh-CN.yml → app/shop/locales/{locale}.yml
   */
  private normalizeFilePath(filePath: string): string {
    // 匹配类似 zh-CN, en-US 这样的语言代码
    return filePath.replace(/\/([a-z]{2}-[A-Z]{2})\.yml$/, '/{locale}.yml');
  }
}
