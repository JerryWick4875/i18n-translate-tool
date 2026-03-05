import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { ReuseEngine } from '../../../core/reuse-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Reuse Translations - Case 2: Multiple Matches';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 生成建议
    const reuseEngine = new ReuseEngine({
      target: 'en-US',
      basePath: tempDir,
      verbose: false,
    }, logger);

    const suggestions = await reuseEngine.generateSuggestions(
      config.scanPatterns,
      'zh-CN',
      path.join(tempDir, '.i18n-translate-tool-reuse.yml')
    );

    // 验证建议文件
    const expectedFile = path.join(expectedDir, '.i18n-translate-tool-reuse.yml');
    const actualContent = await fs.readFile(path.join(tempDir, '.i18n-translate-tool-reuse.yml'), 'utf-8');
    const expectedContent = await fs.readFile(expectedFile, 'utf-8');

    // 简化比较：检查是否包含多选项
    const hasMultipleMatches = actualContent.includes('suggestions:');
    const hasCheckoutItem = actualContent.includes('key: "checkout"');
    const hasTwoOptions = actualContent.includes('Submit Order') && actualContent.includes('Place Order');

    if (hasMultipleMatches && hasCheckoutItem && hasTwoOptions) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed`);
      console.log('Expected suggestions with multiple matches for checkout key');
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
