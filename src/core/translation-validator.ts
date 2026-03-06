import * as path from 'path';
import { Logger } from '../utils/logger';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import {
  RemoteFile,
  ValidationResult,
  SkippedEntry,
  LocaleFile,
  I18nConfig,
  TranslationMapping,
  MappingEntry,
} from '../types';
import { normalizePath } from '../utils/file-utils';

/**
 * 翻译验证器
 * 执行三重匹配验证：文件路径 + Key + 基础语言内容
 */
export class TranslationValidator {
  private scanner: LocaleScanner;
  private yamlHandler: YamlHandler;
  private logger: Logger;
  private config: I18nConfig;
  private basePath: string;
  private filter?: string;

  constructor(
    config: I18nConfig,
    basePath: string,
    filter: string | undefined,
    logger: Logger
  ) {
    this.config = config;
    this.basePath = basePath;
    this.filter = filter;
    this.logger = logger;
    this.scanner = new LocaleScanner(basePath, config.scanPatterns);
    this.yamlHandler = new YamlHandler();
  }

  /**
   * 验证并匹配远程文件到本地文件
   */
  async validate(
    remoteBaseFiles: RemoteFile[],
    remoteTargetFiles: RemoteFile[],
    baseLanguage: string,
    targetLanguage: string,
    mappingFile?: TranslationMapping
  ): Promise<{
    validTranslations: Array<{
      localBaseFile: LocaleFile;
      localTargetFile: LocaleFile;
      remoteBaseFile: RemoteFile | undefined;
      remoteTargetFile: RemoteFile;
      translations: Map<string, string>;
    }>;
    skippedEntries: SkippedEntry[];
  }> {
    this.logger.section('\n🔍 验证翻译...');

    // 创建映射查找索引
    const mappingLookup = mappingFile
      ? this.createMappingLookup(mappingFile)
      : undefined;

    if (mappingLookup) {
      this.logger.verboseLog(`使用映射文件: ${mappingLookup.size} 个映射条目`);
    }

    // 扫描本地文件
    const localFiles = await this.scanLocalFiles();

    // 按语言分组
    const localBaseFiles = localFiles.filter(f => f.language === baseLanguage);
    const localTargetFiles = localFiles.filter(f => f.language === targetLanguage);

    this.logger.verboseLog(`本地基础语言文件: ${localBaseFiles.length}`);
    this.logger.verboseLog(`本地目标语言文件: ${localTargetFiles.length}`);

    const validTranslations: Array<{
      localBaseFile: LocaleFile;
      localTargetFile: LocaleFile;
      remoteBaseFile: RemoteFile | undefined;
      remoteTargetFile: RemoteFile;
      translations: Map<string, string>;
    }> = [];
    const skippedEntries: SkippedEntry[] = [];

    // 为每个远程目标文件查找匹配的本地文件
    for (const remoteTargetFile of remoteTargetFiles) {
      this.logger.verboseLog(`\n处理远程文件: ${remoteTargetFile.path}`);

      // 查找匹配的本地目标文件
      const localTargetFile = this.findMatchingLocalFile(remoteTargetFile, localTargetFiles);

      if (!localTargetFile) {
        this.logger.warn(`  ⚠ 本地文件不存在: ${remoteTargetFile.path}`);
        // 记录所有条目为跳过
        for (const key of Object.keys(remoteTargetFile.content)) {
          skippedEntries.push({
            filePath: remoteTargetFile.path,
            key,
            reason: '本地文件不存在',
          });
        }
        continue;
      }

      this.logger.verboseLog(`  ✓ 匹配本地文件: ${localTargetFile.relativePath}`);

      // 查找匹配的本地基础文件
      const localBaseFile = this.findMatchingLocalFile(
        remoteTargetFile,
        localBaseFiles
      );

      if (!localBaseFile) {
        this.logger.warn(`  ⚠ 本地基础语言文件不存在`);
        for (const key of Object.keys(remoteTargetFile.content)) {
          skippedEntries.push({
            filePath: remoteTargetFile.path,
            key,
            reason: '本地基础语言文件不存在',
          });
        }
        continue;
      }

      this.logger.verboseLog(`  ✓ 匹配基础文件: ${localBaseFile.relativePath}`);

      // 查找匹配的远程基础文件（可选）
      const remoteBaseFile = this.findMatchingRemoteFile(remoteTargetFile, remoteBaseFiles);

      if (!remoteBaseFile) {
        this.logger.verboseLog(`  ℹ 远程基础语言文件不存在（使用本地基础文件进行验证）`);
        // 当没有远程基础文件时，使用本地基础文件进行验证
        // 这发生在只提交了目标语言文件的情况（如使用去重功能时）
      } else {
        this.logger.verboseLog(`  ✓ 匹配远程基础文件: ${remoteBaseFile.path}`);
      }

      // 验证每个翻译条目
      const translations = new Map<string, string>();

      for (const [key, translatedValue] of Object.entries(remoteTargetFile.content)) {
        const validation = this.validateEntry(
          key,
          translatedValue,
          localBaseFile,
          localTargetFile,
          remoteBaseFile,
          mappingLookup
        );

        if (validation.isValid) {
          translations.set(key, translatedValue);

          // 如果有映射文件，添加 otherKeys
          if (mappingLookup) {
            const mapping = this.findMappingByLocation(
              mappingLookup,
              remoteTargetFile.path,
              key
            );

            if (mapping && mapping.otherKeys.length > 0) {
              this.logger.verboseLog(`    📋 找到 ${mapping.otherKeys.length} 个关联键`);
            }
          }
        } else {
          skippedEntries.push({
            filePath: remoteTargetFile.path,
            key,
            reason: validation.reason || '未知原因',
          });
          if (validation.reason) {
            this.logger.verboseLog(`    ⚠ key '${key}': ${validation.reason}`);
          }
        }
      }

      if (translations.size > 0) {
        validTranslations.push({
          localBaseFile,
          localTargetFile,
          remoteBaseFile,
          remoteTargetFile,
          translations,
        });

        this.logger.verboseLog(
          `  ✓ ${remoteTargetFile.path}: ${translations.size} 个有效词条`
        );
      }

      if (skippedEntries.length > translations.size) {
        this.logger.verboseLog(
          `  ⚠ ${remoteTargetFile.path}: 跳过 ${Object.keys(remoteTargetFile.content).length - translations.size} 个词条`
        );
      }
    }

    this.logger.success(`\n验证完成:`);
    this.logger.verboseLog(`  有效翻译: ${validTranslations.length} 个文件`);
    this.logger.verboseLog(`  跳过词条: ${skippedEntries.length} 个`);

    return { validTranslations, skippedEntries };
  }

  /**
   * 创建映射查找索引
   */
  private createMappingLookup(mapping: TranslationMapping): Map<string, MappingEntry> {
    const lookup = new Map<string, MappingEntry>();

    for (const entry of mapping.mappings) {
      // 使用 "file:key" 格式创建索引，规范化路径
      const normalizedFile = normalizePath(entry.primaryKey.file);
      const key = `${normalizedFile}:${entry.primaryKey.key}`;
      lookup.set(key, entry);
    }

    return lookup;
  }

  /**
   * 根据位置查找映射
   */
  private findMappingByLocation(
    lookup: Map<string, MappingEntry>,
    file: string,
    key: string
  ): MappingEntry | undefined {
    const normalizedFile = normalizePath(file);
    return lookup.get(`${normalizedFile}:${key}`);
  }

  /**
   * 扫描本地文件
   */
  private async scanLocalFiles(): Promise<LocaleFile[]> {
    const files = await this.scanner.scan(this.config.scanPatterns);

    // 加载文件内容
    const loadedFiles = await this.yamlHandler.loadFiles(files);

    // 应用过滤器
    if (this.filter) {
      const normalizedFilter = path.normalize(this.filter);
      return loadedFiles.filter(f => {
        const relativeDir = path.dirname(f.relativePath);
        return relativeDir.startsWith(normalizedFilter);
      });
    }

    return loadedFiles;
  }

  /**
   * 查找匹配的本地文件（通过替换语言代码）
   */
  private findMatchingLocalFile(remoteFile: RemoteFile, localFiles: LocaleFile[]): LocaleFile | undefined {
    // 提取远程文件的路径结构
    const remotePath = normalizePath(remoteFile.path);
    const remoteLanguage = remoteFile.language;

    return localFiles.find(f => {
      // 构建期望的本地文件路径：将远程路径中的语言代码替换为本地文件的语言代码
      const localLanguage = f.language;
      const localPath = normalizePath(f.relativePath);

      // 如果语言代码不同，尝试在路径中替换
      if (remoteLanguage !== localLanguage) {
        // 将远程路径中的语言代码替换为本地语言代码
        const expectedPath = remotePath.replace(`/${remoteLanguage}/`, `/${localLanguage}/`);
        return localPath === expectedPath;
      }

      // 如果语言代码相同，直接比较路径
      return localPath === remotePath;
    });
  }

  /**
   * 查找匹配的远程文件（通过替换语言代码）
   */
  private findMatchingRemoteFile(
    targetFile: RemoteFile,
    baseFiles: RemoteFile[]
  ): RemoteFile | undefined {
    const targetLanguage = targetFile.language;
    const targetPath = normalizePath(targetFile.path);

    return baseFiles.find(f => {
      const baseLanguage = f.language;
      const basePath = normalizePath(f.path);

      // 如果语言代码不同，尝试在路径中替换
      if (targetLanguage !== baseLanguage) {
        const expectedPath = targetPath.replace(`/${targetLanguage}/`, `/${baseLanguage}/`);
        return basePath === expectedPath;
      }

      return basePath === targetPath;
    });
  }

  /**
   * 验证单个翻译条目（三重匹配）
   */
  private validateEntry(
    key: string,
    translatedValue: string,
    localBaseFile: LocaleFile,
    localTargetFile: LocaleFile,
    remoteBaseFile: RemoteFile | undefined,
    mappingLookup?: Map<string, MappingEntry>
  ): ValidationResult {
    // 1. 检查 key 是否存在于本地目标文件
    if (!(key in localTargetFile.content)) {
      return {
        isValid: false,
        reason: 'key 在本地文件中不存在',
      };
    }

    // 2. 检查翻译值是否为空
    if (!translatedValue || translatedValue.trim() === '') {
      return {
        isValid: false,
        reason: '翻译值为空',
      };
    }

    // 3. 检查 key 是否存在于本地基础文件
    if (!(key in localBaseFile.content)) {
      return {
        isValid: false,
        reason: 'key 在本地基础语言文件中不存在',
      };
    }

    // 4. 如果有远程基础文件，检查基础语言文案是否匹配（防止 key 被重新使用）
    if (remoteBaseFile) {
      if (!(key in remoteBaseFile.content)) {
        return {
          isValid: false,
          reason: 'key 在远程基础语言文件中不存在',
        };
      }

      const localBaseValue = localBaseFile.content[key];
      const remoteBaseValue = remoteBaseFile.content[key];

      if (localBaseValue !== remoteBaseValue) {
        return {
          isValid: false,
          reason: '本地基础语言文案已变更（可能 key 被重新使用）',
        };
      }
    }

    return { isValid: true };
  }
}
