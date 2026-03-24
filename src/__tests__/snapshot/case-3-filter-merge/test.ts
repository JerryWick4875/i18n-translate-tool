import * as path from 'path';
import { copyToTemp, cleanupTemp } from '../../utils';
import { SnapshotManager } from '../../../core/snapshot-manager';
import { LocaleScanner } from '../../../core/scanner';
import { YamlHandler } from '../../../core/yaml-handler';
import { filterFilesByGlob } from '../../../utils/filter-utils';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Snapshot Filter Merge - Key 级别合并';
  console.log(`\n🧪 Test: ${testName}`);
  console.log('目的：验证使用 filter 时，进行 key 级别的合并\n');

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const scanner = new LocaleScanner(tempDir);
    const yamlHandler = new YamlHandler();
    const snapshotDir = path.join(tempDir, 'i18n-translate-snapshot');
    const snapshotManager = new SnapshotManager(snapshotDir, config.snapshot?.pathPattern || '{app}/{locale}.yml');

    // 验证初始快照存在
    const shopInitial = await snapshotManager.readSnapshot('shop', 'en-US');
    const widgetInitial = await snapshotManager.readSnapshot('widget', 'en-US');

    if (!shopInitial || !widgetInitial) {
      throw new Error('初始快照不存在');
    }

    console.log('📋 初始快照状态：');
    console.log('  shop/en-US.yml:');
    const shopInitialContent = shopInitial['app/shop/locales/zh-CN.yml'];
    console.log(`    shopTitle: "${shopInitialContent?.shopTitle}"`);
    console.log(`    shopDesc: "${shopInitialContent?.shopDesc}"`);
    console.log(`    shopPrice: "${shopInitialContent?.shopPrice}"`);
    console.log('  widget/en-US.yml:');
    console.log(`    widgetTitle: "${widgetInitial['app/widget/locales/zh-CN.yml']?.widgetTitle}"`);
    console.log();

    // 使用 filter 只更新 shop
    console.log('📸 使用 filter app/shop/**/*.yml 进行 key 级别合并...');
    console.log('  源文件变更：shopTitle 更新，shopNew 新增，shopPrice 缺失');
    console.log();

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
    console.log('📋 合并后快照状态：');
    const shopAfter = await snapshotManager.readSnapshot('shop', 'en-US');
    const widgetAfter = await snapshotManager.readSnapshot('widget', 'en-US');

    if (!shopAfter || !widgetAfter) {
      throw new Error('更新后快照不存在');
    }

    const shopContent = shopAfter['app/shop/locales/zh-CN.yml'];
    console.log('  shop/en-US.yml:');
    console.log(`    shopTitle: "${shopContent?.shopTitle}"`);
    console.log(`    shopDesc: "${shopContent?.shopDesc}"`);
    console.log(`    shopPrice: "${shopContent?.shopPrice}"`);
    console.log(`    shopNew: "${shopContent?.shopNew}"`);
    console.log();

    // 验证 key 级别合并
    console.log('✅ 验证结果：');

    // shopTitle: 更新为新值
    if (shopContent?.shopTitle !== '商品标题更新') {
      throw new Error('shopTitle 应该被更新');
    }
    console.log('  ✓ shopTitle 已更新');

    // shopDesc: 保留原有值（即使源文件有）
    if (shopContent?.shopDesc !== '商品描述') {
      throw new Error('shopDesc 应该保留原有值');
    }
    console.log('  ✓ shopDesc 保留原有值');

    // shopPrice: 保留原有值（源文件没有这个 key）
    if (shopContent?.shopPrice !== '商品价格') {
      throw new Error('shopPrice 应该保留原有值');
    }
    console.log('  ✓ shopPrice 保留原有值（源文件缺失）');

    // shopNew: 新增 key
    if (!shopContent?.shopNew) {
      throw new Error('shopNew 应该被新增');
    }
    console.log('  ✓ shopNew 新增成功');

    // widget: 完全保留
    const widgetContent = widgetAfter['app/widget/locales/zh-CN.yml'];
    if (widgetContent?.widgetTitle !== '组件标题') {
      throw new Error('widget 快照不应该被修改');
    }
    console.log('  ✓ widget 快照完全保留');

    console.log();
    console.log('💡 关键点：mergeSnapshot 进行 key 级别的合并，');
    console.log('   只更新/添加指定的 key，其他 key 完整保留。');

    console.log(`\n✅ ${testName} passed`);
  } finally {
    await cleanupTemp(tempDir);
  }
}
