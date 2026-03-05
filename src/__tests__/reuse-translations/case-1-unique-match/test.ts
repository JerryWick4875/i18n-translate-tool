import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { ReuseEngine } from '../../../core/reuse-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Reuse Translations - Case 1: Unique Match';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 生成并应用建议（一键模式）
    const reuseEngine = new ReuseEngine({
      target: 'en-US',
      basePath: tempDir,
      verbose: false,
    }, logger);

    await reuseEngine.generateAndApply(
      config.scanPatterns,
      'zh-CN',
      false  // not dry run
    );

    // 验证结果
    const result = await compareDirs(
      path.join(tempDir, 'app'),
      path.join(expectedDir, 'app')
    );

    if (result) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed`);
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
