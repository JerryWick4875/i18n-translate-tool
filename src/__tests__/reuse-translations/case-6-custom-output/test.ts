import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, cleanupTemp } from '../../utils';
import { ReuseEngine } from '../../../core/reuse-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Reuse Translations - Case 6: Custom Output Path';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 使用自定义输出路径生成建议
    const reuseEngine = new ReuseEngine({
      target: 'en-US',
      basePath: tempDir,
      verbose: false,
    }, logger);

    const customOutputPath = path.join(tempDir, 'my-custom-suggestions.yml');
    await reuseEngine.generateSuggestions(
      config.scanPatterns,
      'zh-CN',
      customOutputPath  // 自定义路径
    );

    // 验证自定义文件存在
    try {
      await fs.access(customOutputPath);
    } catch {
      console.log(`❌ ${testName} failed: Custom output file should exist`);
      process.exit(1);
    }

    // 验证默认文件不存在
    const defaultOutputPath = path.join(tempDir, '.i18n-translate-tool-reuse.yml');
    try {
      await fs.access(defaultOutputPath);
      console.log(`❌ ${testName} failed: Default output file should not exist when custom path is used`);
      process.exit(1);
    } catch {
      // Expected - default file should not exist
    }

    // 验证自定义文件内容
    const content = await fs.readFile(customOutputPath, 'utf-8');
    if (content.includes('Product Title') && content.includes('widget.yml')) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed: Custom output file content is incorrect`);
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
