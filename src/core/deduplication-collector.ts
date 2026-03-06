import { HashGenerator } from './hash-generator';
import { TranslationMapping, MappingEntry, DedupedEntry, KeyLocation } from '../types';
import { Logger } from '../utils/logger';

/**
 * 去重收集器
 * 收集并去重翻译条目
 */
export class DeduplicationCollector {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 收集并去重翻译条目
   * @param entries 所有未翻译的条目，按文件路径分组
   * @returns 去重后的条目列表
   */
  collect(entries: Map<string, Map<string, string>>): DedupedEntry[] {
    this.logger.verboseLog('\n🔍 开始收集和去重...');

    // 按基础语言文案分组
    const valueGroups = new Map<string, KeyLocation[]>();

    for (const [filePath, keys] of entries.entries()) {
      for (const [key, baseValue] of keys.entries()) {
        if (!valueGroups.has(baseValue)) {
          valueGroups.set(baseValue, []);
        }
        valueGroups.get(baseValue)!.push({ file: filePath, key });
      }
    }

    this.logger.verboseLog(`  找到 ${entries.size} 个文件中的 ${this.countTotalKeys(entries)} 个词条`);
    this.logger.verboseLog(`  去重后: ${valueGroups.size} 个唯一文案`);

    // 为每个分组创建去重条目
    const dedupedEntries: DedupedEntry[] = [];

    for (const [baseValue, locations] of valueGroups.entries()) {
      // 按文件:key 排序，选择第一个作为主键
      const sortedLocations = this.sortLocations(locations);
      const primaryKey = sortedLocations[0];
      const otherKeys = sortedLocations.slice(1);

      // 生成唯一 ID
      const uniqueId = HashGenerator.generate(baseValue);

      dedupedEntries.push({
        uniqueId,
        baseValue,
        primaryKey,
        otherKeys,
      });
    }

    // 统计去重效果
    const totalKeys = this.countTotalKeys(entries);
    const uniqueValues = valueGroups.size;
    const deduplicationRate = ((totalKeys - uniqueValues) / totalKeys * 100).toFixed(1);

    this.logger.verboseLog(`\n📊 去重统计:`);
    this.logger.verboseLog(`  总词条数: ${totalKeys}`);
    this.logger.verboseLog(`  唯一文案: ${uniqueValues}`);
    this.logger.verboseLog(`  去重率: ${deduplicationRate}%`);

    return dedupedEntries;
  }

  /**
   * 生成映射文件结构
   */
  generateMapping(dedupedEntries: DedupedEntry[]): TranslationMapping {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      mappings: dedupedEntries.map(entry => ({
        uniqueId: entry.uniqueId,
        baseValue: entry.baseValue,
        primaryKey: entry.primaryKey,
        otherKeys: entry.otherKeys,
      })),
    };
  }

  /**
   * 对位置信息进行排序
   */
  private sortLocations(locations: KeyLocation[]): KeyLocation[] {
    return locations.sort((a, b) => {
      const aKey = `${a.file}:${a.key}`;
      const bKey = `${b.file}:${b.key}`;
      return aKey.localeCompare(bKey);
    });
  }

  /**
   * 计算总键数
   */
  private countTotalKeys(entries: Map<string, Map<string, string>>): number {
    let count = 0;
    for (const keys of entries.values()) {
      count += keys.size;
    }
    return count;
  }
}
