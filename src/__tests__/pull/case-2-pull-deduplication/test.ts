import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { TranslationValidator } from '../../../core/translation-validator';
import { TranslationMerger } from '../../../core/translation-merger';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';
import { TranslationMapping, RemoteFile } from '../../../types';

export async function run() {
  const testName = 'Pull Deduplication - Case 2: Pull with Mapping File';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 创建模拟的映射文件（使用 cart.title 作为主键，因为字母排序）
    const mappingFile: TranslationMapping = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      mappings: [
        {
          uniqueId: 'abc123',
          baseValue: '商品标题',
          primaryKey: {
            file: 'app/shop/locales/en-US/entries/translations.yml',
            key: 'cart.title',  // 使用 cart.title 作为主键（字母排序）
          },
          otherKeys: [
            {
              file: 'app/shop/locales/en-US/entries/translations.yml',
              key: 'order.title',
            },
            {
              file: 'app/shop/locales/en-US/entries/translations.yml',
              key: 'product.title',
            },
          ],
        },
      ],
    };

    // 创建模拟的远程文件（GitLab 上的翻译）
    const mockRemoteFiles = {
      baseFiles: [
        {
          path: 'app/shop/locales/zh-CN/entries/translations.yml',
          content: {
            'product.title': '商品标题',
            'product.name': '商品名称',
            'product.price': '价格',
            'cart.title': '商品标题',
            'cart.empty': '购物车为空',
            'cart.checkout': '去结算',
            'order.title': '商品标题',
            'order.status': '订单状态',
            'order.total': '订单总额',
          },
          language: 'zh-CN',
        },
      ],
      targetFiles: [
        {
          path: 'app/shop/locales/en-US/entries/translations.yml',
          content: {
            'cart.title': 'Product Title',  // 主键的翻译
            'product.price': 'Price',
            'cart.checkout': 'Checkout',
            'order.status': 'Order Status',
            'order.total': 'Order Total',
          },
          language: 'en-US',
        },
      ],
    };

    // 创建验证器并验证翻译（传入映射文件）
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

    // 创建合并器并合并翻译（传入映射查找）
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

    // 验证结果
    const actualPath = path.join(
      tempDir,
      'app/shop/locales/en-US/entries/translations.yml'
    );
    const expectedPath = path.join(
      expectedDir,
      'app/shop/locales/en-US/entries/translations.yml'
    );

    const actualContent = await fs.readFile(actualPath, 'utf-8');
    const expectedContent = await fs.readFile(expectedPath, 'utf-8');

    if (actualContent.trim() !== expectedContent.trim()) {
      console.log('\n❌ 翻译文件不匹配');
      console.log('预期内容:');
      console.log(expectedContent);
      console.log('\n实际内容:');
      console.log(actualContent);
      process.exit(1);
    }

    // 验证：确保 otherKeys 被正确填充
    if (!actualContent.includes('cart.title: "Product Title"')) {
      console.log('\n❌ cart.title 应该被填充为 "Product Title"');
      console.log('实际内容:');
      console.log(actualContent);
      process.exit(1);
    }

    if (!actualContent.includes('order.title: "Product Title"')) {
      console.log('\n❌ order.title 应该被填充为 "Product Title"');
      console.log('实际内容:');
      console.log(actualContent);
      process.exit(1);
    }

    if (!actualContent.includes('product.title: "Product Title"')) {
      console.log('\n❌ product.title 应该被填充为 "Product Title"');
      console.log('实际内容:');
      console.log(actualContent);
      process.exit(1);
    }

    console.log(`\n✅ ${testName} passed`);

  } finally {
    await cleanupTemp(tempDir);
  }
}
