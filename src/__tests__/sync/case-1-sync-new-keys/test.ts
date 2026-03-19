import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SyncEngine } from '../../../core/sync-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Sync New Keys';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  // Setup: Copy source to temp
  const tempDir = await copyToTemp(sourceDir);

  try {
    // Load config
    const config = await loadConfig(tempDir);

    // Create sync engine and execute
    const logger = Logger.silent();
    const syncEngine = new SyncEngine(
      {
        target: 'en-US',
        basePath: tempDir,
        verbose: false,
        dryRun: false,
      },
      '{app}/{locale}.yml',
      logger
    );

    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    await syncEngine.sync(
      config.scanPatterns,
      snapshotDir,
      config.baseLanguage
    );

    // Verify: Compare temp with expected
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
