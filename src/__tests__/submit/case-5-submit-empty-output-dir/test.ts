import * as fs from 'fs/promises';
import * as path from 'path';
import { SubmissionExtractor } from '../../../core/submission-extractor';
import { Logger } from '../../../utils/logger';
import { I18nConfig } from '../../../types';

/**
 * 测试场景：outputDir 存在但为空目录时，应该直接删除并重新生成，而不是报错
 *
 * 这个测试模拟 `submit.ts` 命令中的逻辑：
 * 1. 检查 outputDir 是否存在
 * 2. 如果存在，检查目录下是否有文件
 * 3. 如果没有文件（目录为空），删除目录并重新提取
 */
async function runTest() {
  console.log('🧪 Test: Empty output directory handling\n');

  const testDir = path.resolve(__dirname);
  const sourceDir = path.join(testDir, 'source');
  const outputDir = path.join(testDir, 'output');

  // 清理并创建空的输出目录（模拟之前残留的输出目录）
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  console.log('✅ Created empty output directory');

  // 验证目录为空
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const hasFiles = entries.some((entry) => entry.isFile());
  if (hasFiles) {
    console.error('❌ Output directory should be empty (no files)');
    process.exit(1);
  }
  console.log('✅ Verified output directory has no files');

  // 加载配置
  const config: I18nConfig = {
    baseLanguage: 'zh-CN',
    scanPatterns: [
      'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
    ],
  };

  const logger = new Logger(true, false);
  let result;

  // 模拟 submit.ts 中的逻辑
  // 检查 outputDir 是否存在且为空
  if (!hasFiles) {
    // 目录为空（没有文件），直接删除并重新生成
    console.log('\n📦 Output directory is empty, removing and regenerating...');
    await fs.rm(outputDir, { recursive: true, force: true });

    // 创建提取器
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
    result = await extractor.extract(
      config.scanPatterns,
      'zh-CN',
      'en-US',
      outputDir
    );

    if (result.fileCount === 0) {
      console.error('❌ No files extracted');
      process.exit(1);
    }
  }

  console.log('\n📊 Result:');
  console.log(`  Files: ${result!.fileCount}`);
  console.log(`  Entries: ${result!.entryCount}`);

  // 验证文件被正确提取
  console.log('✅ Files were extracted successfully');

  // 验证输出目录现在包含文件
  const outputFiles = await fs.readdir(outputDir, { recursive: true });
  const hasYmlFiles = outputFiles.some((f) => f.endsWith('.yml'));
  if (!hasYmlFiles) {
    console.error('❌ Output directory should contain extracted .yml files');
    process.exit(1);
  }
  console.log('✅ Output directory contains extracted files');

  // 期望的输出文件列表（只有未翻译的文件）
  const expectedFiles = [
    'app/shop/config/products/widget/locales/zh-CN/locales.yml',
    'app/shop/config/products/widget/locales/en-US/locales.yml',
    'app/shop/config/products/widget/locales/zh-CN/common.yml',
    'app/shop/config/products/widget/locales/en-US/common.yml',
  ];

  // 验证结果
  for (const file of expectedFiles) {
    const outputPath = path.join(outputDir, file);

    try {
      await fs.access(outputPath);
      console.log(`✅ ${file} exists`);
    } catch (error) {
      console.error(`❌ ${file} does not exist`);
      process.exit(1);
    }
  }

  // 验证 messages.yml 文件不在输出中（因为完全翻译）
  const messagesFileEnUS = path.join(
    outputDir,
    'app/shop/config/products/widget/locales/en-US/messages.yml'
  );
  const messagesFileExists = await fs
    .access(messagesFileEnUS)
    .then(() => true)
    .catch(() => false);
  if (messagesFileExists) {
    console.error(`❌ messages.yml should not be in output (fully translated)`);
    process.exit(1);
  }
  console.log(`✅ messages.yml correctly skipped (fully translated)`);

  // 验证文件数量
  if (result!.fileCount !== expectedFiles.length / 2) {
    console.error(
      `❌ Expected ${expectedFiles.length / 2} file pairs, got ${result!.fileCount}`
    );
    process.exit(1);
  }

  console.log('\n✅ Test passed!');
  console.log(`   - Empty output directory was handled correctly`);
  console.log(`   - ${result!.fileCount} file pairs extracted`);
  console.log(`   - ${result!.entryCount} untranslated entries found`);
  console.log(`   - No error was thrown for existing empty directory`);
}

runTest().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
