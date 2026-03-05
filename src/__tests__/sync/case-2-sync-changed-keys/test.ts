import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SyncEngine } from '../../../core/sync-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Sync Changed Keys';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();
    const syncEngine = new SyncEngine(
      {
        target: 'en-US',
        basePath: tempDir,
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
