import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SnapshotManager } from '../../../core/snapshot-manager';
import { LocaleScanner } from '../../../core/scanner';
import { YamlHandler } from '../../../core/yaml-handler';
import { filterFilesByGlob } from '../../../utils/filter-utils';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Snapshot Filter by glob pattern';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);

    // Scan files
    const scanner = new LocaleScanner(tempDir);
    let files = await scanner.scan(config.scanPatterns);

    // Apply filter - only process shop directory
    files = await filterFilesByGlob(files, ['app/shop/**/*.yml'], tempDir);

    // Load files
    const yamlHandler = new YamlHandler();
    const loadedFiles = await yamlHandler.loadFiles(files);

    // Get base language files
    const baseFiles = scanner.getFilesForAppAndLanguage(
      loadedFiles,
      'shop',
      config.baseLanguage
    );

    // Prepare snapshot data
    const baseData = new Map<string, Record<string, string>>();
    for (const file of baseFiles) {
      baseData.set(file.relativePath, file.content);
    }

    // Create snapshot
    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    const snapshotManager = new SnapshotManager(snapshotDir, config.snapshot?.pathPattern || '{app}/{locale}.yml');
    await snapshotManager.createSnapshot('shop', 'en-US', baseData);

    // Verify: Only shop snapshot should exist, not widget
    const result = await compareDirs(
      snapshotDir,
      expectedDir
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
