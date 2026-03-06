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

    // 如果有映射文件，首先处理 otherKeys
    if (mappingLookup && mappingLookup.size > 0) {
      this.logger.verboseLog(`\n📋 使用映射文件处理关联键...`);
      await this.resolveOtherKeys(translationData, mappingLookup, force, dryRun);
    }

    let filledCount = 0;
    let skippedCount = 0;
    let fileCount = 0;

    for (const item of translationData) {
      const { localTargetFile, translations } = item;

      this.logger.verboseLog(`\n处理文件: ${localTargetFile.relativePath}`);

      // 读取当前文件内容
      const currentContent = localTargetFile.content;
      const newContent = { ...currentContent };

      let fileFilledCount = 0;
      let fileSkippedCount = 0;

      // 应用每个翻译
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

        // 应用翻译
        newContent[key] = translatedValue;
        fileFilledCount++;

        if (dryRun || currentContent[key] !== translatedValue) {
          this.logger.verboseLog(
            `  ✓ key '${key}': "${currentContent[key]}" -> "${translatedValue}"`
          );
        }
      }

      // 写入文件（如果不是 dry run）
      if (fileFilledCount > 0 && !dryRun) {
        try {
          await this.yamlHandler.writeFile(localTargetFile.path, newContent);
          fileCount++;
          this.logger.verboseLog(`  ✓ ${localTargetFile.relativePath}: 填充 ${fileFilledCount} 个词条`);
        } catch (error) {
          this.logger.error(`  ✗ ${localTargetFile.relativePath}: 写入失败`);
          if (error instanceof Error) {
            this.logger.verboseLog(`    错误: ${error.message}`);
          }
        }
      } else if (fileFilledCount > 0) {
        fileCount++;
        this.logger.verboseLog(`  [DRY RUN] ${localTargetFile.relativePath}: 将填充 ${fileFilledCount} 个词条`);
      }

      if (fileSkippedCount > 0) {
        this.logger.verboseLog(`  ⚠ ${localTargetFile.relativePath}: 跳过 ${fileSkippedCount} 个词条`);
      }

      filledCount += fileFilledCount;
      skippedCount += fileSkippedCount;
    }

    this.logger.success(`\n合并完成:`);
    this.logger.verboseLog(`  填充词条: ${filledCount}`);
    this.logger.verboseLog(`  跳过词条: ${skippedCount}`);
    this.logger.verboseLog(`  修改文件: ${fileCount}`);

    return {
      filledCount,
      skippedCount,
      fileCount,
    };
  }

  /**
   * 解析并应用 otherKeys
   */
  private async resolveOtherKeys(
    translationData: Array<{
      localTargetFile: LocaleFile;
      translations: Map<string, string>;
    }>,
    mappingLookup: Map<string, MappingEntry>,
    force: boolean,
    dryRun: boolean
  ): Promise<void> {
    if (!this.scanner || !this.config || !this.basePath) {
      this.logger.warn('无法解析 otherKeys：缺少 scanner 或 config');
      return;
    }

    // 收集所有需要更新的 otherKeys
    const otherKeysToUpdate = new Map<string, Map<string, string>>(); // filePath -> (key -> value)

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

          if (!otherKeysToUpdate.has(otherFilePath)) {
            otherKeysToUpdate.set(otherFilePath, new Map());
          }

          // 验证 baseValue 是否匹配（从基础语言文件读取）
          const localBaseValue = await this.getLocalBaseValue(otherFilePath, otherKeyName);
          if (localBaseValue !== undefined && localBaseValue === mapping.baseValue) {
            otherKeysToUpdate.get(otherFilePath)!.set(otherKeyName, translatedValue);
            this.logger.verboseLog(
              `  📋 关联键: ${otherFilePath}:${otherKeyName} = "${translatedValue}"`
            );
          } else {
            this.logger.warn(
              `  ⚠ 跳过关联键 ${otherFilePath}:${otherKeyName}（基础值不匹配或不存在）`
            );
          }
        }
      }
    }

    // 应用 otherKeys 的翻译
    if (otherKeysToUpdate.size > 0) {
      this.logger.verboseLog(`\n应用 ${otherKeysToUpdate.size} 个文件的关联键翻译...`);

      // 扫描并加载所有本地文件
      const allFiles = await this.scanner.scan(this.config!.scanPatterns);
      const loadedFiles = await this.yamlHandler.loadFiles(allFiles);

      for (const [filePath, translations] of otherKeysToUpdate.entries()) {
        // 查找对应的本地文件（需要规范化路径进行比较）
        const localFile = loadedFiles.find(f => normalizePath(f.relativePath) === normalizePath(filePath));

        if (!localFile) {
          this.logger.warn(`  ⚠ 本地文件不存在: ${filePath}`);
          continue;
        }

        // 应用翻译
        const currentContent = localFile.content;
        const newContent = { ...currentContent };
        let fileFilledCount = 0;

        for (const [key, translatedValue] of translations.entries()) {
          const currentValue = currentContent[key];

          // 检查是否需要跳过（已有翻译且不使用 force）
          if (currentValue && currentValue.trim() !== '' && !force) {
            this.logger.verboseLog(
              `  ⚠ ${filePath}:${key}: 已存在翻译（使用 --force 覆盖）`
            );
            continue;
          }

          newContent[key] = translatedValue;
          fileFilledCount++;
        }

        // 写入文件
        if (fileFilledCount > 0 && !dryRun) {
          try {
            await this.yamlHandler.writeFile(localFile.path, newContent);
            this.logger.verboseLog(`  ✓ ${filePath}: 填充 ${fileFilledCount} 个关联键`);
          } catch (error) {
            this.logger.error(`  ✗ ${filePath}: 写入失败`);
            if (error instanceof Error) {
              this.logger.verboseLog(`    错误: ${error.message}`);
            }
          }
        } else if (fileFilledCount > 0) {
          this.logger.verboseLog(`  [DRY RUN] ${filePath}: 将填充 ${fileFilledCount} 个关联键`);
        }
      }
    }
  }

  /**
   * 获取本地基础语言文件的值
   * 首先尝试从目标语言文件路径读取，如果值存在但不为空则返回；
   * 否则尝试从基础语言文件路径读取
   */
  private async getLocalBaseValue(filePath: string, key: string): Promise<string | undefined> {
    if (!this.scanner || !this.config || !this.basePath || !this.baseLanguage) {
      return undefined;
    }

    try {
      // 规范化路径（处理 Windows 路径分隔符）
      const normalizedFilePath = normalizePath(filePath);

      // 首先尝试直接读取文件（可能是目标语言文件）
      let fullPath = path.join(this.basePath, normalizedFilePath);
      let content = await this.yamlHandler.loadFile(fullPath);

      // 如果键存在且值不为空，返回该值
      if (key in content && content[key] && content[key].trim() !== '') {
        return content[key];
      }

      // 如果直接读取失败或值为空，尝试将语言代码替换为基础语言代码
      // 例如：app/shop/locales/en-US/translations.yml -> app/shop/locales/zh-CN/translations.yml
      const pathParts = normalizedFilePath.split('/');
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        // 检查是否是语言代码（包含连字符的通常是语言代码，如 en-US, zh-CN）
        if (part.includes('-') && i > 0) {
          // 替换为基础语言代码
          const newPathParts = [...pathParts];
          newPathParts[i] = this.baseLanguage;
          const newFilePath = newPathParts.join('/');

          fullPath = path.join(this.basePath, newFilePath);
          content = await this.yamlHandler.loadFile(fullPath);

          if (key in content) {
            return content[key];
          }

          break; // 只尝试第一次匹配的语言代码
        }
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }
}
