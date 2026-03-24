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
  console.log('目的：验证使用 filter 时，只更新匹配的文件，其他文件保持原快照\n');

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
    const shopInitial = await snapshotManager.readSnapshot('shop', 'en-US');
    const widgetInitial = await snapshotManager.readSnapshot('widget', 'en-US');

    if (!shopInitial || !widgetInitial) {
      throw new Error('初始快照不存在');
    }

    console.log('📋 初始快照状态：');
    console.log(`  shop/en-US.yml: ${JSON.stringify(shopInitial['app/shop/locales/zh-CN.yml'])}`);
    console.log(`  widget/en-US.yml: ${JSON.stringify(widgetInitial['app/widget/locales/zh-CN.yml'])}`);
    console.log();

    // 使用 filter 只更新 shop
    console.log('📸 使用 filter app/shop/**/*.yml 更新快照...');

    const files = await scanner.scan(config.scanPatterns);
    const filteredFiles = await filterFilesByGlob(files, ['app/shop/**/*.yml'], tempDir);
    const loadedFiles = await yamlHandler.loadFiles(filteredFiles);

    const shopBaseFiles = scanner.getFilesForAppAndLanguage(loadedFiles, 'shop', config.baseLanguage);
    const shopBaseData = new Map<string, Record<string, string>>();
    for (const file of shopBaseFiles) {
      shopBaseData.set(file.relativePath, file.content);
    }

    // 使用 mergeSnapshot 更新 shop
    await snapshotManager.mergeSnapshot('shop', 'en-US', shopBaseData);

    // 验证结果
    console.log();
    console.log('📋 更新后快照状态：');

    const shopAfter = await snapshotManager.readSnapshot('shop', 'en-US');
    const widgetAfter = await snapshotManager.readSnapshot('widget', 'en-US');

    if (!shopAfter || !widgetAfter) {
      throw new Error('更新后快照不存在');
    }

    const shopContent = shopAfter['app/shop/locales/zh-CN.yml'];
    const widgetContent = widgetAfter['app/widget/locales/zh-CN.yml'];

    console.log(`  shop/en-US.yml: ${JSON.stringify(shopContent)}`);
    console.log(`  widget/en-US.yml: ${JSON.stringify(widgetContent)}`);
    console.log();

    // 验证 shop 被更新
    if (shopContent?.shopTitle !== '商品标题更新' || !shopContent?.shopNew) {
      throw new Error('shop 快照未正确更新');
    }
    console.log('  ✅ shop 快照已更新为新内容');

    // 验证 widget 保持不变
    if (widgetContent?.widgetTitle !== '组件标题') {
      throw new Error('widget 快照内容被意外修改');
    }
    console.log('  ✅ widget 快照保持原有内容（未被影响）');

    console.log();
    console.log('💡 关键点：mergeSnapshot 只更新指定的文件，');
    console.log('   其他文件（widget）的快照数据完整保留，不会被清空或删除。');

    console.log(`\n✅ ${testName} passed`);
  } finally {
    await cleanupTemp(tempDir);
  }
}
