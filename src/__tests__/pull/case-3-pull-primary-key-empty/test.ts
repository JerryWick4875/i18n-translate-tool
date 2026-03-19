import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { TranslationValidator } from '../../../core/translation-validator';
import { TranslationMerger } from '../../../core/translation-merger';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';
import { TranslationMapping, RemoteFile } from '../../../types';

export async function run() {
  const testName = 'Pull Deduplication - Case 3: Primary Key Empty (Tests Coverage for Overwrite Bug)';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = new Logger(true, false);  // verbose mode

    // 创建映射文件：cart.title 是主键，order.title 和 product.title 是关联键
    const mappingFile: TranslationMapping = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      mappings: [
        {
          uniqueId: 'test-mapping-1',
          baseValue: '商品标题',
          primaryKey: {
            file: 'app/shop/locales/en-US/entries/translations.yml',
            key: 'cart.title',  // 主键：在本地文件中为空
          },
          otherKeys: [
            {
              file: 'app/shop/locales/en-US/entries/translations.yml',
              key: 'order.title',  // 关联键：在本地文件中为空
            },
            {
              file: 'app/shop/locales/en-US/entries/translations.yml',
              key: 'product.title',  // 关联键：在本地文件中为空
            },
          ],
        },
      ],
    };

    // 模拟远程文件：只有主键的翻译
    const mockRemoteFiles = {
      baseFiles: [
        {
          path: 'app/shop/locales/zh-CN/entries/translations.yml',
          content: {
            'cart.title': '商品标题',
            'order.title': '商品标题',
            'product.title': '商品标题',
            'cart.empty': '购物车为空',
            'cart.checkout': '去结算',
          },
          language: 'zh-CN',
        },
      ],
      targetFiles: [
        {
          path: 'app/shop/locales/en-US/entries/translations.yml',
          content: {
            'cart.title': '商品标题翻译',  // 主键的翻译（本地为空，需要填充）
          },
          language: 'en-US',
        },
      ],
    };

    // 验证翻译
    const validator = new TranslationValidator(
      config,
      tempDir,
      undefined,
      logger
    );

    const { validTranslations, skippedEntries } = await validator.validate(
      mockRemoteFiles.baseFiles,
      mockRemoteFiles.targetFiles,
      'zh-CN',
      'en-US',
      mappingFile
    );

    console.log(`  有效翻译: ${validTranslations.length} 个文件`);
    console.log(`  跳过词条: ${skippedEntries.length} 个`);

    if (validTranslations.length === 0) {
      throw new Error('没有找到有效的翻译');
    }

    // 创建映射查找索引
    const mappingLookup = new Map<string, any>();
    for (const entry of mappingFile.mappings) {
      const key = `${entry.primaryKey.file}:${entry.primaryKey.key}`;
      mappingLookup.set(key, entry);
    }

    // 合并翻译
    const merger = new TranslationMerger(logger, config, tempDir);
    const result = await merger.merge(
      validTranslations,
      false,  // force
      false,  // dryRun
      mappingLookup
    );

    console.log(`  填充词条: ${result.filledCount}`);
    console.log(`  跳过词条: ${result.skippedCount}`);
    console.log(`  修改文件: ${result.fileCount}`);

    // 验证结果文件内容
    const actualPath = path.join(tempDir, 'app/shop/locales/en-US/entries/translations.yml');
    const actualContent = await fs.readFile(actualPath, 'utf-8');

    // 关键验证：确保主键和关联键都被正确填充
    // 这个测试用例旨在捕获"主键覆盖关联键"的 bug
    const expectedValues = [
      { key: 'cart.title', expected: '商品标题翻译', desc: '主键' },
      { key: 'order.title', expected: '商品标题翻译', desc: '关联键1' },
      { key: 'product.title', expected: '商品标题翻译', desc: '关联键2' },
    ];

    for (const { key, expected, desc } of expectedValues) {
      const expectedLine = `${key}: "${expected}"`;
      if (!actualContent.includes(expectedLine)) {
        console.log(`\n❌ ${desc} ${key} 应该被填充为 "${expected}"`);
        console.log('实际内容:');
        console.log(actualContent);
        process.exit(1);
      }
      console.log(`  ✓ ${desc} ${key} 正确填充为 "${expected}"`);
    }

    // 验证其他键没有被修改
    if (!actualContent.includes('cart.empty: "Cart is empty"')) {
      console.log('\n❌ cart.empty 不应该被修改');
      console.log('实际内容:');
      console.log(actualContent);
      process.exit(1);
    }

    console.log(`\n✅ ${testName} passed`);

  } finally {
    await cleanupTemp(tempDir);
  }
}
