import * as path from 'path';
import * as fs from 'fs/promises';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { ReuseEngine } from '../../../core/reuse-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Reuse Translations - Case 5: One-Time Mode';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 一键模式：生成并立即应用唯一匹配
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

    // 验证中间文件不存在
    const intermediateFile = path.join(tempDir, '.i18n-translate-tool-reuse.yml');
    try {
      await fs.access(intermediateFile);
      console.log(`❌ ${testName} failed: Intermediate file should not exist in one-time mode`);
      process.exit(1);
    } catch {
      // Expected - file should not exist
    }

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
