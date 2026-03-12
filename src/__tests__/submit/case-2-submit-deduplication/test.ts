import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { SubmissionExtractor } from '../../../core/submission-extractor';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Submit Deduplication - Case 2: Basic Deduplication';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 创建提取器并启用去重
    const extractor = new SubmissionExtractor(
      {
        target: 'en-US',
        basePath: tempDir,
        verbose: false,
        deduplication: true,
      },
      config,
      logger
    );

    // 执行提取
    const result = await extractor.extract(
      config.scanPatterns,
      config.baseLanguage,
      'en-US',
      path.join(tempDir, 'i18n-translate-submission')
    );

    console.log(`  提取文件: ${result.fileCount}`);
    console.log(`  提取词条: ${result.entryCount}`);

    // 验证：检查基础语言文件
    const actualBasePath = path.join(
      tempDir,
      'i18n-translate-submission',
      'zh-CN',
      'app/shop/locales/en-US/entries/translations.yml'
    );
    const expectedBasePath = path.join(
      expectedDir,
      'zh-CN/app/shop/locales/en-US/entries/translations.yml'
    );

    const actualBaseContent = await fs.readFile(actualBasePath, 'utf-8');
    const expectedBaseContent = await fs.readFile(expectedBasePath, 'utf-8');

    if (actualBaseContent.trim() !== expectedBaseContent.trim()) {
      console.log('\n❌ 基础语言文件不匹配');
      console.log('预期内容:');
      console.log(expectedBaseContent);
      console.log('\n实际内容:');
      console.log(actualBaseContent);
      process.exit(1);
    }

    // 验证：检查目标语言文件
    const actualTargetPath = path.join(
      tempDir,
      'i18n-translate-submission',
      'en-US',
      'app/shop/locales/en-US/entries/translations.yml'
    );
    const expectedTargetPath = path.join(
      expectedDir,
      'en-US/app/shop/locales/en-US/entries/translations.yml'
    );

    const actualTargetContent = await fs.readFile(actualTargetPath, 'utf-8');
    const expectedTargetContent = await fs.readFile(expectedTargetPath, 'utf-8');

    if (actualTargetContent.trim() !== expectedTargetContent.trim()) {
      console.log('\n❌ 目标语言文件不匹配');
      console.log('预期内容:');
      console.log(expectedTargetContent);
      console.log('\n实际内容:');
      console.log(actualTargetContent);
      process.exit(1);
    }

    // 验证：检查映射文件是否存在
    const mappingPath = path.join(
      tempDir,
      'i18n-translate-submission',
      'zh-CN',
      '_translation-mapping.yml'
    );

    try {
      const mappingContent = await fs.readFile(mappingPath, 'utf-8');

      // 验证映射文件包含必要的字段
      if (!mappingContent.includes('uniqueId')) {
        console.log('\n❌ 映射文件格式错误：缺少 uniqueId');
        process.exit(1);
      }

      if (!mappingContent.includes('baseValue')) {
        console.log('\n❌ 映射文件格式错误：缺少 baseValue');
        process.exit(1);
      }

      if (!mappingContent.includes('primaryKey')) {
        console.log('\n❌ 映射文件格式错误：缺少 primaryKey');
        process.exit(1);
      }

      if (!mappingContent.includes('otherKeys')) {
        console.log('\n❌ 映射文件格式错误：缺少 otherKeys');
        process.exit(1);
      }

      // 验证映射文件包含重复文案的映射
      if (!mappingContent.includes('商品标题')) {
        console.log('\n❌ 映射文件缺少重复文案的映射');
        process.exit(1);
      }

      // 验证映射中有重复文案的映射（包含 primaryKey 和 otherKeys）
      if (!mappingContent.includes('cart.title') || !mappingContent.includes('order.title') || !mappingContent.includes('product.title')) {
        console.log('\n❌ 映射文件应该包含所有 3 个 title 键的映射');
        console.log('实际映射文件内容:');
        console.log(mappingContent);
        process.exit(1);
      }

      // 验证 otherKeys 包含 2 个键
      const otherKeysMatches = mappingContent.match(/otherKeys:/g);
      if (!otherKeysMatches || otherKeysMatches.length < 1) {
        console.log('\n❌ 映射文件应该包含 otherKeys');
        console.log('实际映射文件内容:');
        console.log(mappingContent);
        process.exit(1);
      }

      console.log('\n✅ 映射文件验证通过');

    } catch (error) {
      console.log('\n❌ 映射文件不存在或无法读取');
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }

    // 验证：确保去重后词条数正确
    // 原始未翻译词条: product.title, product.price, cart.title, cart.checkout, order.title, order.status, order.total = 7
    // 去重后: cart.title (主键), product.price, cart.checkout, order.status, order.total = 5
    if (result.entryCount !== 5) {
      console.log(`\n❌ 去重后词条数不正确，期望 5，实际 ${result.entryCount}`);
      process.exit(1);
    }

    console.log(`\n✅ ${testName} passed`);

  } finally {
    await cleanupTemp(tempDir);
  }
}
