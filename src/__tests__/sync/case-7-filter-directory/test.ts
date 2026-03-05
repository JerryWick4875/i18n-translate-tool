import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SyncEngine } from '../../../core/sync-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Filter Directory';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  // Setup: Copy source to temp
  const tempDir = await copyToTemp(sourceDir);

  try {
    // Load config
    const config = await loadConfig(tempDir);

    // Create sync engine and execute with filter
    const logger = Logger.silent();
    const syncEngine = new SyncEngine(
      {
        target: 'en-US',
        basePath: tempDir,
        filter: 'app/app1',  // Only process app/app1
        verbose: false,
        dryRun: false,
      },
      '{app}/{target}.yml',
      logger
    );

    const snapshotDir = path.join(tempDir, '.i18n-snapshot');
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

    // Also verify snapshot
    const snapshotResult = await compareDirs(
      path.join(tempDir, '.i18n-snapshot'),
      path.join(expectedDir, '.i18n-snapshot')
    );

    if (result && snapshotResult) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed`);
      if (!result) console.log('  - App files mismatch');
      if (!snapshotResult) console.log('  - Snapshot files mismatch');
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
