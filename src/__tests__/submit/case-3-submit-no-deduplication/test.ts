import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { SubmissionExtractor } from '../../../core/submission-extractor';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Submit Deduplication - Case 3: No Deduplication';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 创建提取器并禁用去重
    const extractor = new SubmissionExtractor(
      {
        target: 'en-US',
        basePath: tempDir,
        verbose: false,
        deduplication: false,  // 禁用去重
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
      'app/shop/locales/zh-CN/entries/translations.yml'
    );
    const expectedBasePath = path.join(
      expectedDir,
      'app/shop/locales/zh-CN/entries/translations.yml'
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
      'app/shop/locales/en-US/entries/translations.yml'
    );
    const expectedTargetPath = path.join(
      expectedDir,
      'app/shop/locales/en-US/entries/translations.yml'
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

    // 验证：确保没有创建映射文件
    const mappingPath = path.join(
      tempDir,
      'i18n-translate-submission',
      '_translation-mapping.yml'
    );

    try {
      await fs.access(mappingPath);
      console.log('\n❌ 禁用去重时不应该创建映射文件');
      process.exit(1);
    } catch {
      // 映射文件不存在，符合预期
    }

    // 验证：确保包含所有未翻译的键（包括重复的）
    if (result.entryCount !== 7) {
      console.log(`\n❌ 词条数不正确，期望 7（包含重复），实际 ${result.entryCount}`);
      process.exit(1);
    }

    console.log(`\n✅ ${testName} passed`);

  } finally {
    await cleanupTemp(tempDir);
  }
}
