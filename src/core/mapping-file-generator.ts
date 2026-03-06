import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { TranslationMapping } from '../types';
import { Logger } from '../utils/logger';

/**
 * 映射文件生成器
 * 生成翻译去重映射文件
 */
export class MappingFileGenerator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 生成映射文件内容
   */
  generateContent(mapping: TranslationMapping): string {
    const content = yaml.dump(mapping, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    });

    return content;
  }

  /**
   * 写入映射文件
   */
  async writeFile(filePath: string, mapping: TranslationMapping): Promise<void> {
    this.logger.verboseLog(`\n📝 生成映射文件: ${filePath}`);

    const content = this.generateContent(mapping);
    await fs.writeFile(filePath, content, 'utf-8');

    this.logger.verboseLog(`  ✓ 映射文件已生成`);
  }

  /**
   * 记录映射摘要
   */
  logSummary(mapping: TranslationMapping): void {
    this.logger.section('\n📋 映射文件摘要:');
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
      this.logger.info(`  其中包含其他键的条目: ${withOtherKeys}`);
    }
  }
}
