import { Logger } from '../utils/logger';
import { YamlHandler } from './yaml-handler';
import { LocaleFile, MappingEntry } from '../types';
import * as path from 'path';
import { LocaleScanner } from './scanner';
import { I18nConfig } from '../types';
import { normalizePath } from '../utils/file-utils';

/**
 * 翻译合并器
 * 将验证通过的翻译应用到本地文件
 */
export class TranslationMerger {
  private yamlHandler: YamlHandler;
  private logger: Logger;
  private scanner?: LocaleScanner;
  private config?: I18nConfig;
  private basePath?: string;
  private baseLanguage?: string;

  constructor(logger: Logger, config?: I18nConfig, basePath?: string) {
    this.yamlHandler = new YamlHandler();
    this.logger = logger;
    if (config && basePath) {
      this.config = config;
      this.basePath = basePath;
      this.baseLanguage = config.baseLanguage;
      this.scanner = new LocaleScanner(basePath, config.scanPatterns);
    }
  }

  /**
   * 合并翻译到本地文件
   */
  async merge(
    translationData: Array<{
      localTargetFile: LocaleFile;
      translations: Map<string, string>;
    }>,
    force: boolean,
    dryRun: boolean,
    mappingLookup?: Map<string, MappingEntry>
  ): Promise<{
    filledCount: number;
    skippedCount: number;
    fileCount: number;
  }> {
    this.logger.section('\n💾 合并翻译...');

    if (dryRun) {
      this.logger.warn('🔒 DRY RUN 模式：不会实际修改文件');
    }

    // 收集所有需要写入的改动（主键 + 关联键）
    const allChanges = new Map<string, Map<string, string>>(); // filePath -> (key -> value)

    // 如果有映射文件，处理 otherKeys 并添加到改动集合
    if (mappingLookup && mappingLookup.size > 0) {
      this.logger.verboseLog(`\n📋 使用映射文件处理关联键...`);
      await this.collectOtherKeys(translationData, mappingLookup, force, allChanges);
    }

    let filledCount = 0;
    let skippedCount = 0;
    let fileCount = 0;

    // 处理主键并添加到改动集合
    for (const item of translationData) {
      const { localTargetFile, translations } = item;

      this.logger.verboseLog(`\n处理文件: ${localTargetFile.relativePath}`);

      // 获取该文件的改动集合
      const filePath = localTargetFile.relativePath;
      if (!allChanges.has(filePath)) {
        allChanges.set(filePath, new Map());
      }
      const fileChanges = allChanges.get(filePath)!;

      // 读取当前文件内容
      const currentContent = localTargetFile.content;
      let fileFilledCount = 0;
      let fileSkippedCount = 0;

      // 应用每个翻译（主键）
      for (const [key, translatedValue] of translations.entries()) {
        const currentValue = currentContent[key];

        // 检查是否需要跳过（已有翻译且不使用 force）
        if (currentValue && currentValue.trim() !== '' && !force) {
          this.logger.verboseLog(
            `  ⚠ key '${key}': 已存在翻译 "${currentValue}"（使用 --force 覆盖）`
          );
          fileSkippedCount++;
          continue;
        }

        // 添加到改动集合
        fileChanges.set(key, translatedValue);
        fileFilledCount++;

        if (dryRun || currentContent[key] !== translatedValue) {
          this.logger.verboseLog(
            `  ✓ key '${key}': "${currentContent[key]}" -> "${translatedValue}"`
          );
        }
      }

      if (fileSkippedCount > 0) {
        this.logger.verboseLog(`  ⚠ ${localTargetFile.relativePath}: 跳过 ${fileSkippedCount} 个词条`);
      }

      filledCount += fileFilledCount;
      skippedCount += fileSkippedCount;
    }

    // 一次性写入所有改动
    if (allChanges.size > 0) {
      this.logger.verboseLog(`\n应用 ${allChanges.size} 个文件的改动...`);
      await this.applyAllChanges(translationData, allChanges, dryRun);

      // 统计文件数
      for (const changes of allChanges.values()) {
        if (changes.size > 0) {
          fileCount++;
        }
      }
    }

    return {
      filledCount,
      skippedCount,
      fileCount,
    };
  }

  /**
   * 收集 otherKeys 的改动（不直接写入）
   */
  private async collectOtherKeys(
    translationData: Array<{
      localTargetFile: LocaleFile;
      translations: Map<string, string>;
    }>,
    mappingLookup: Map<string, MappingEntry>,
    force: boolean,
    allChanges: Map<string, Map<string, string>>
  ): Promise<void> {
    if (!this.scanner || !this.config || !this.basePath) {
      this.logger.warn('无法解析 otherKeys：缺少 scanner 或 config');
      return;
    }

    for (const item of translationData) {
      const { localTargetFile, translations } = item;

      for (const [key, translatedValue] of translations.entries()) {
        // 查找映射
        const mappingKey = `${normalizePath(localTargetFile.relativePath)}:${key}`;
        const mapping = mappingLookup.get(mappingKey);

        if (!mapping) {
          continue;
        }

        // 处理 otherKeys
        for (const otherKey of mapping.otherKeys) {
          const otherFilePath = otherKey.file;
          const otherKeyName = otherKey.key;

          // 获取该文件的改动集合
          if (!allChanges.has(otherFilePath)) {
            allChanges.set(otherFilePath, new Map());
          }
          const fileChanges = allChanges.get(otherFilePath)!;

          // 检查是否需要跳过（从本地文件读取当前值）
          const localFile = await this.getLocalFile(otherFilePath);
          if (!localFile) {
            this.logger.warn(`  ⚠ 本地文件不存在: ${otherFilePath}`);
            continue;
          }

          const currentValue = localFile.content[otherKeyName];
          if (currentValue && currentValue.trim() !== '' && !force) {
            this.logger.verboseLog(
              `  ⚠ ${otherFilePath}:${otherKeyName}: 已存在翻译（使用 --force 覆盖）`
            );
            continue;
          }

          // 获取关联键在本地基础语言文件中的值
          const otherKeyBaseValue = await this.getLocalBaseValue(
            otherFilePath,
            otherKeyName,
            localTargetFile.language
          );

          // 验证关联键的 baseValue 是否与主键的 baseValue 匹配
          if (otherKeyBaseValue !== undefined && otherKeyBaseValue === mapping.baseValue) {
            fileChanges.set(otherKeyName, translatedValue);
            this.logger.verboseLog(
              `  📋 关联键: ${otherFilePath}:${otherKeyName} = "${translatedValue}"`
            );
          } else {
            this.logger.warn(
              `  ⚠ 跳过关联键 ${otherFilePath}:${otherKeyName}（${otherKeyBaseValue === undefined ? '在本地基础语言文件中不存在' : `基础值不匹配: "${otherKeyBaseValue}" !== "${mapping.baseValue}"`}）`
            );
          }
        }
      }
    }
  }

  /**
   * 应用所有改动到文件
   */
  private async applyAllChanges(
    translationData: Array<{
      localTargetFile: LocaleFile;
      translations: Map<string, string>;
    }>,
    allChanges: Map<string, Map<string, string>>,
    dryRun: boolean
  ): Promise<void> {
    if (!this.scanner || !this.config || !this.basePath) {
      return;
    }

    // 扫描并加载所有本地文件
    const allFiles = await this.scanner.scan(this.config.scanPatterns);
    const loadedFiles = await this.yamlHandler.loadFiles(allFiles);

    for (const [filePath, changes] of allChanges.entries()) {
      if (changes.size === 0) continue;

      // 查找对应的本地文件（需要规范化路径进行比较）
      const localFile = loadedFiles.find(f => normalizePath(f.relativePath) === normalizePath(filePath));

      if (!localFile) {
        this.logger.warn(`  ⚠ 本地文件不存在: ${filePath}`);
        continue;
      }

      // 应用改动
      const newContent = { ...localFile.content };
      for (const [key, value] of changes.entries()) {
        newContent[key] = value;
      }

      // 写入文件
      if (!dryRun) {
        try {
          await this.yamlHandler.writeFile(localFile.path, newContent);
          this.logger.verboseLog(`  ✓ ${filePath}: 填充 ${changes.size} 个词条`);
        } catch (error) {
          this.logger.error(`  ✗ ${filePath}: 写入失败`);
          if (error instanceof Error) {
            this.logger.verboseLog(`    错误: ${error.message}`);
          }
        }
      } else {
        this.logger.verboseLog(`  [DRY RUN] ${filePath}: 将填充 ${changes.size} 个词条`);
      }
    }
  }

  /**
   * 获取本地文件
   */
  private async getLocalFile(filePath: string): Promise<{ content: Record<string, string>; path: string } | undefined> {
    if (!this.scanner || !this.config || !this.basePath) {
      return undefined;
    }

    try {
      const normalizedFilePath = normalizePath(filePath);
      const fullPath = path.join(this.basePath, normalizedFilePath);
      const content = await this.yamlHandler.loadFile(fullPath);
      return { content, path: fullPath };
    } catch (error) {
      return undefined;
    }
  }

  /**
   * 获取本地基础语言文件的值
   * 将文件路径中的目标语言代码替换为基础语言代码，然后读取 key 的值
   */
  private async getLocalBaseValue(
    filePath: string,
    key: string,
    targetLanguage: string
  ): Promise<string | undefined> {
    if (!this.scanner || !this.config || !this.basePath || !this.baseLanguage) {
      return undefined;
    }

    try {
      // 规范化路径（处理 Windows 路径分隔符）
      const normalizedFilePath = normalizePath(filePath);

      // 使用目标语言代码精确替换（来自 localTargetFile.language）
      // 替换路径中的 /{targetLanguage}/ 为 /{baseLanguage}/
      const baseLanguageFilePath = normalizedFilePath.replace(
        `/${targetLanguage}/`,
        `/${this.baseLanguage}/`
      );

      // 读取基础语言文件
      const fullPath = path.join(this.basePath, baseLanguageFilePath);
      const content = await this.yamlHandler.loadFile(fullPath);

      return content[key];
    } catch (error) {
      return undefined;
    }
  }
}
