import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { SnapshotManager } from '../../../core/snapshot-manager';
import { LocaleScanner } from '../../../core/scanner';
import { YamlHandler } from '../../../core/yaml-handler';
import { filterFilesByGlob } from '../../../utils/filter-utils';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Snapshot Filter Merge - 保留其他文件快照';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const scanner = new LocaleScanner(tempDir);
    const yamlHandler = new YamlHandler();
    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    const snapshotManager = new SnapshotManager(snapshotDir, config.snapshot?.pathPattern || '{app}/{locale}.yml');

    // 验证初始快照存在（从 source 目录复制过来的）
    const shopInitialSnapshot = await snapshotManager.readSnapshot('shop', 'en-US');
    const widgetInitialSnapshot = await snapshotManager.readSnapshot('widget', 'en-US');

    if (!shopInitialSnapshot || !widgetInitialSnapshot) {
      throw new Error('初始快照不存在');
    }

    // 使用 filter 只更新 shop
    const files = await scanner.scan(config.scanPatterns);
    const filteredFiles = await filterFilesByGlob(files, ['app/shop/**/*.yml'], tempDir);
    const loadedFiles = await yamlHandler.loadFiles(filteredFiles);

    const shopBaseFiles = scanner.getFilesForAppAndLanguage(loadedFiles, 'shop', config.baseLanguage);
    const shopBaseData = new Map<string, Record<string, string>>();
    for (const file of shopBaseFiles) {
      shopBaseData.set(file.relativePath, file.content);
    }

    // 使用 mergeSnapshot 更新 shop（不会影响 widget）
    await snapshotManager.mergeSnapshot('shop', 'en-US', shopBaseData);

    // 验证结果：对比快照目录与 expected 目录
    const result = await compareDirs(snapshotDir, expectedDir);

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
