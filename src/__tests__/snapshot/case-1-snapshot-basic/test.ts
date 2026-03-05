import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SnapshotManager } from '../../../core/snapshot-manager';
import { LocaleScanner } from '../../../core/scanner';
import { YamlHandler } from '../../../core/yaml-handler';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Snapshot Basic';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  // Setup: Copy source to temp
  const tempDir = await copyToTemp(sourceDir);

  try {
    // Load config
    const config = await loadConfig(tempDir);

    // Scan and load files
    const scanner = new LocaleScanner(tempDir);
    const files = await scanner.scan(config.scanPatterns);
    const yamlHandler = new YamlHandler();
    const loadedFiles = await yamlHandler.loadFiles(files);

    // Get base language files
    const baseFiles = scanner.getFilesForAppAndLanguage(
      loadedFiles,
      'app1',
      config.baseLanguage
    );

    // Prepare snapshot data
    const baseData = new Map<string, Record<string, string>>();
    for (const file of baseFiles) {
      baseData.set(file.relativePath, file.content);
    }

    // Create snapshot
    const snapshotManager = new SnapshotManager(
      path.join(tempDir, 'i18n-translate-snapshot')
    );
    await snapshotManager.createSnapshot('app1', 'en-US', baseData);

    // Verify: Compare temp with expected
    const result = await compareDirs(
      path.join(tempDir, 'i18n-translate-snapshot'),
      path.join(expectedDir, 'i18n-translate-snapshot')
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
