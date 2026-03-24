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
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const scanner = new LocaleScanner(tempDir);
    const yamlHandler = new YamlHandler();
    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    const snapshotManager = new SnapshotManager(snapshotDir, config.snapshot?.pathPattern || '{app}/{locale}.yml');

    // 步骤 1: 创建初始快照（包含 shop 和 widget）
    console.log('  步骤 1: 创建初始快照...');
    let files = await scanner.scan(config.scanPatterns);
    let loadedFiles = await yamlHandler.loadFiles(files);

    // shop 快照
    const shopBaseFiles = scanner.getFilesForAppAndLanguage(loadedFiles, 'shop', config.baseLanguage);
    const shopBaseData = new Map<string, Record<string, string>>();
    for (const file of shopBaseFiles) {
      shopBaseData.set(file.relativePath, file.content);
    }
    await snapshotManager.createSnapshot('shop', 'en-US', shopBaseData);

    // widget 快照
    const widgetBaseFiles = scanner.getFilesForAppAndLanguage(loadedFiles, 'widget', config.baseLanguage);
    const widgetBaseData = new Map<string, Record<string, string>>();
    for (const file of widgetBaseFiles) {
      widgetBaseData.set(file.relativePath, file.content);
    }
    await snapshotManager.createSnapshot('widget', 'en-US', widgetBaseData);

    console.log('  初始快照已创建');

    // 步骤 2: 使用 filter 只更新 shop（修改 shop 的内容）
    console.log('  步骤 2: 使用 filter 更新 shop...');

    // 修改 shop 的源文件，模拟内容变化
    const fs = await import('fs/promises');
    const shopZhPath = path.join(tempDir, 'app/shop/locales/zh-CN.yml');
    await fs.writeFile(shopZhPath, 'shopTitle: "商品标题更新"\nshopDesc: "商品描述"\nshopNew: "新增字段"\n');

    // 使用 filter 只处理 shop
    files = await scanner.scan(config.scanPatterns);
    files = await filterFilesByGlob(files, ['app/shop/**/*.yml'], tempDir);
    loadedFiles = await yamlHandler.loadFiles(files);

    const shopUpdatedBaseFiles = scanner.getFilesForAppAndLanguage(loadedFiles, 'shop', config.baseLanguage);
    const shopUpdatedBaseData = new Map<string, Record<string, string>>();
    for (const file of shopUpdatedBaseFiles) {
      shopUpdatedBaseData.set(file.relativePath, file.content);
    }

    // 使用 mergeSnapshot 更新 shop（不会影响 widget）
    await snapshotManager.mergeSnapshot('shop', 'en-US', shopUpdatedBaseData);

    console.log('  shop 快照已合并更新');

    // 步骤 3: 验证结果
    console.log('  步骤 3: 验证结果...');

    // 验证 shop 快照是新数据
    const shopSnapshot = await snapshotManager.readSnapshot('shop', 'en-US');
    if (!shopSnapshot) {
      throw new Error('shop 快照不存在');
    }
    const shopSnapshotContent = shopSnapshot['app/shop/locales/zh-CN.yml'];
    if (!shopSnapshotContent || shopSnapshotContent.shopTitle !== '商品标题更新' || !shopSnapshotContent.shopNew) {
      throw new Error('shop 快照未正确更新');
    }

    // 验证 widget 快照仍然存在（未被删除）
    const widgetSnapshot = await snapshotManager.readSnapshot('widget', 'en-US');
    if (!widgetSnapshot) {
      throw new Error('widget 快照被意外删除（应该保留）');
    }
    const widgetSnapshotContent = widgetSnapshot['app/widget/locales/zh-CN.yml'];
    if (!widgetSnapshotContent || widgetSnapshotContent.widgetTitle !== '组件标题') {
      throw new Error('widget 快照数据不正确（应该保留原始数据）');
    }

    console.log(`✅ ${testName} passed`);
  } finally {
    await cleanupTemp(tempDir);
  }
}
