import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { ReuseEngine } from '../../../core/reuse-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Reuse Translations - Case 4: Ignore Values';
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

    await reuseEngine.generateSuggestions(
      config.scanPatterns,
      'zh-CN',
      path.join(tempDir, '.i18n-translate-tool-reuse.yml')
    );

    // 验证建议文件
    const actualContent = await fs.readFile(path.join(tempDir, '.i18n-translate-tool-reuse.yml'), 'utf-8');

    // 验证包含所有被忽略的值的建议
    const hasTitle = actualContent.includes('key: "title"') && actualContent.includes('Product Title');
    const hasButton = actualContent.includes('key: "button"') && actualContent.includes('Submit Button');
    const hasLink = actualContent.includes('key: "link"') && actualContent.includes('View Link');

    if (hasTitle && hasButton && hasLink) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed`);
      console.log('Expected suggestions for all keys with ignore values');
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
