import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { TranslationMapping, MappingEntry } from '../types';
import { Logger } from '../utils/logger';
import { normalizePath } from '../utils/file-utils';

/**
 * 映射文件加载器
 * 加载和解析翻译去重映射文件
 */
export class MappingLoader {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 从文件加载映射
   */
  async loadFromFile(filePath: string): Promise<TranslationMapping | null> {
    try {
      this.logger.verboseLog(`\n📂 加载映射文件: ${filePath}`);

      const content = await fs.readFile(filePath, 'utf-8');
      const mapping = this.parse(content);

      this.logSummary(mapping);
      return mapping;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.warn(`无法加载映射文件: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 从字符串解析映射
   */
  parse(content: string): TranslationMapping {
    try {
      const parsed = yaml.load(content) as TranslationMapping;

      // 验证基本结构
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('映射文件格式无效：根对象不是对象');
      }

      if (!parsed.version) {
        throw new Error('映射文件格式无效：缺少 version 字段');
      }

      if (!Array.isArray(parsed.mappings)) {
        throw new Error('映射文件格式无效：mappings 不是数组');
      }

      // 验证每个映射条目
      for (let i = 0; i < parsed.mappings.length; i++) {
        const entry = parsed.mappings[i];
        if (!entry.uniqueId || !entry.baseValue || !entry.primaryKey) {
          throw new Error(`映射文件格式无效：第 ${i + 1} 个映射条目缺少必需字段`);
        }
        if (!Array.isArray(entry.otherKeys)) {
          throw new Error(`映射文件格式无效：第 ${i + 1} 个映射条目的 otherKeys 不是数组`);
        }
      }

      return parsed;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`解析映射文件失败: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 创建查找索引以提高查询效率
   */
  createLookup(mapping: TranslationMapping): Map<string, MappingEntry> {
    const lookup = new Map<string, MappingEntry>();

    for (const entry of mapping.mappings) {
      // 使用 uniqueId 作为键
      lookup.set(entry.uniqueId, entry);
    }

    return lookup;
  }

  /**
   * 根据主键位置查找映射条目
   * 路径比较时会规范化为正斜杠（跨平台兼容）
   */
  findByPrimaryKey(mapping: TranslationMapping, file: string, key: string): MappingEntry | undefined {
    const normalizedFile = normalizePath(file);

    for (const entry of mapping.mappings) {
      const entryFile = normalizePath(entry.primaryKey.file);
      if (entryFile === normalizedFile && entry.primaryKey.key === key) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * 根据基础语言文案查找映射条目
   */
  findByBaseValue(mapping: TranslationMapping, baseValue: string): MappingEntry | undefined {
    for (const entry of mapping.mappings) {
      if (entry.baseValue === baseValue) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * 记录映射摘要
   */
  logSummary(mapping: TranslationMapping): void {
    this.logger.section('\n📋 映射文件信息:');
    this.logger.info(`  版本: ${mapping.version}`);
    this.logger.info(`  生成时间: ${mapping.generatedAt}`);
    this.logger.info(`  映射条目: ${mapping.mappings.length}`);

    let withOtherKeys = 0;
    for (const entry of mapping.mappings) {
      if (entry.otherKeys.length > 0) {
        withOtherKeys++;
      }
    }

    if (withOtherKeys > 0) {
      this.logger.info(`  包含其他键的条目: ${withOtherKeys}`);
    }
  }
}
