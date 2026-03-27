import * as fs from 'fs/promises';
import * as path from 'path';
import { SubmissionExtractor } from '../../../core/submission-extractor';
import { Logger } from '../../../utils/logger';
import { I18nConfig } from '../../../types';

async function runTest() {
  console.log('🧪 Test: Basic submission extraction\n');

  const testDir = path.resolve(__dirname);
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');
  const outputDir = path.join(testDir, 'output');

  // 清理输出目录
  await fs.rm(outputDir, { recursive: true, force: true });

  // 加载配置
  const config: I18nConfig = {
    baseLanguage: 'zh-CN',
    scanPatterns: [
      'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
    ],
    snapshot: {
      dir: 'i18n-translate-snapshot',
      pathPattern: '{app}/{product}/{locale}.yml',
    },
    reuse: {
      outputFile: '.i18n-translate-tool-reuse.yml',
    },
  };

  // 创建提取器
  const logger = new Logger(true, false);
  const extractor = new SubmissionExtractor(
    {
      target: 'en-US',
      basePath: sourceDir,
      verbose: true,
    },
    config,
    logger
  );

  // 执行提取
  const result = await extractor.extract(
    config.scanPatterns,
    'zh-CN',
    'en-US',
    outputDir
  );

  console.log('\n📊 Result:');
  console.log(`  Files: ${result.fileCount}`);
  console.log(`  Entries: ${result.entryCount}`);

  // 期望的输出文件列表（只有未翻译的文件）
  const expectedFiles = [
    'zh-CN/app/shop/config/products/widget/locales/zh-CN/locales.yml',
    'en-US/app/shop/config/products/widget/locales/en-US/locales.yml',
    'zh-CN/app/shop/config/products/widget/locales/zh-CN/common.yml',
    'en-US/app/shop/config/products/widget/locales/en-US/common.yml',
  ];

  // 验证结果
  for (const file of expectedFiles) {
    const outputPath = path.join(outputDir, file);
    const expectedPath = path.join(expectedDir, file.replace(/^(zh-CN|en-US)\//, ''));

    try {
      const outputContent = await fs.readFile(outputPath, 'utf-8');
      const expectedContent = await fs.readFile(expectedPath, 'utf-8');

      if (outputContent === expectedContent) {
        console.log(`✅ ${file} matches expected`);
      } else {
        console.log(`❌ ${file} does not match expected`);
        console.log('Expected file:', expectedPath);
        console.log('Output file:', outputPath);
        console.log('Expected:\n', expectedContent);
        console.log('Got:\n', outputContent);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error verifying ${file}:`, error);
      process.exit(1);
    }
  }

  // 验证 messages.yml 文件不在输出中（因为完全翻译）
  const messagesFileEnUS = path.join(outputDir, 'en-US/app/shop/config/products/widget/locales/en-US/messages.yml');
  const messagesFileExists = await fs.access(messagesFileEnUS).then(() => true).catch(() => false);
  if (messagesFileExists) {
    console.error(`❌ messages.yml should not be in output (fully translated)`);
    process.exit(1);
  }
  console.log(`✅ messages.yml correctly skipped (fully translated)`);

  // 验证文件数量
  if (result.fileCount !== expectedFiles.length / 2) {
    console.error(`❌ Expected ${expectedFiles.length / 2} file pairs, got ${result.fileCount}`);
    process.exit(1);
  }

  // 验证条目数量
  const expectedEntryCount = 4; // locales.yml: 2, common.yml: 2, total = 4
  if (result.entryCount !== expectedEntryCount) {
    console.error(`❌ Expected ${expectedEntryCount} entries, got ${result.entryCount}`);
    process.exit(1);
  }

  console.log('\n✅ Test passed!');
  console.log(`   - ${result.fileCount} file pairs extracted`);
  console.log(`   - ${result.entryCount} untranslated entries found`);
  console.log(`   - 1 file skipped (fully translated: messages.yml)`);
  console.log('\n📁 Test files summary:');
  console.log(`   - locales.yml: 2 untranslated entries`);
  console.log(`   - common.yml: 2 untranslated entries`);
  console.log(`   - messages.yml: fully translated (skipped)`);
}

runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
