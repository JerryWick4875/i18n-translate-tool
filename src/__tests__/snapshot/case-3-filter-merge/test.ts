import * as path from 'path';
import { copyToTemp, cleanupTemp } from '../../utils';
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

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const scanner = new LocaleScanner(tempDir);
    const yamlHandler = new YamlHandler();
    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    const snapshotManager = new SnapshotManager(snapshotDir, config.snapshot?.pathPattern || '{app}/{locale}.yml');

    // 验证初始快照存在（从 source 目录复制过来的）
    console.log('  验证初始快照...');

    const shopInitialSnapshot = await snapshotManager.readSnapshot('shop', 'en-US');
    if (!shopInitialSnapshot) {
      throw new Error('初始 shop 快照不存在');
    }
    console.log('  ✓ shop 初始快照存在');

    const widgetInitialSnapshot = await snapshotManager.readSnapshot('widget', 'en-US');
    if (!widgetInitialSnapshot) {
      throw new Error('初始 widget 快照不存在');
    }
    console.log('  ✓ widget 初始快照存在');

    // 记录 widget 初始快照的标题（用于后续验证）
    const widgetInitialTitle = widgetInitialSnapshot['app/widget/locales/zh-CN.yml']?.widgetTitle;

    // 使用 filter 只更新 shop
    console.log('  使用 filter app/shop/**/*.yml 更新快照...');

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
    console.log('  ✓ shop 快照已合并更新');

    // 验证结果
    console.log('  验证结果...');

    // 验证 shop 快照已更新（包含新数据）
    const shopUpdatedSnapshot = await snapshotManager.readSnapshot('shop', 'en-US');
    if (!shopUpdatedSnapshot) {
      throw new Error('更新后 shop 快照不存在');
    }

    const shopSnapshotContent = shopUpdatedSnapshot['app/shop/locales/zh-CN.yml'];
    if (!shopSnapshotContent) {
      throw new Error('shop 快照内容为空');
    }

    // 验证新字段存在
    if (shopSnapshotContent.shopTitle !== '商品标题更新') {
      throw new Error(`shop 快照未更新，期望 shopTitle="商品标题更新"，实际="${shopSnapshotContent.shopTitle}"`);
    }

    if (!shopSnapshotContent.shopNew) {
      throw new Error('shop 快照缺少新字段 shopNew');
    }

    console.log('  ✓ shop 快照已更新为最新内容');

    // 验证 widget 快照仍然存在且保持原有内容
    const widgetSnapshot = await snapshotManager.readSnapshot('widget', 'en-US');
    if (!widgetSnapshot) {
      throw new Error('widget 快照被意外删除（应该保留）');
    }

    const widgetSnapshotContent = widgetSnapshot['app/widget/locales/zh-CN.yml'];
    if (!widgetSnapshotContent) {
      throw new Error('widget 快照内容为空');
    }

    // 验证 widget 内容与初始快照一致
    if (widgetSnapshotContent.widgetTitle !== widgetInitialTitle) {
      throw new Error(`widget 快照内容被修改，期望 widgetTitle="${widgetInitialTitle}"，实际="${widgetSnapshotContent.widgetTitle}"`);
    }

    console.log('  ✓ widget 快照保持原有内容（未被影响）');

    console.log(`\n✅ ${testName} passed`);
  } finally {
    await cleanupTemp(tempDir);
  }
}
