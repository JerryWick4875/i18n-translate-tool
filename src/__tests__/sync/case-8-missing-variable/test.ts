import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SyncEngine } from '../../../core/sync-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Missing Variable Fallback';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // pathPattern 包含 {product}，但 scanPatterns 中没有 product 变量
    // 验证缺失的变量会用 __default__ 填充
    const syncEngine = new SyncEngine(
      {
        target: 'en-US',
        basePath: tempDir,
        verbose: false,
        dryRun: false,
      },
      '{app}/{product}/{target}.yml',
      logger
    );

    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    await syncEngine.sync(
      config.scanPatterns,
      snapshotDir,
      config.baseLanguage
    );

    // 验证：比较 app 目录
    const appResult = await compareDirs(
      path.join(tempDir, 'app'),
      path.join(expectedDir, 'app')
    );

    // 验证：比较快照目录（确认使用了 __default__ 路径）
    const snapshotResult = await compareDirs(
      path.join(tempDir, 'i18n-translate-snapshot'),
      path.join(expectedDir, 'i18n-translate-snapshot')
    );

    if (appResult && snapshotResult) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed`);
      if (!appResult) console.log('  - app directory mismatch');
      if (!snapshotResult) console.log('  - snapshot directory mismatch');
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
