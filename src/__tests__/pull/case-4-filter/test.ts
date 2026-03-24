import { TranslationValidator } from '../../../core/translation-validator';
import { TranslationMerger } from '../../../core/translation-merger';
import { I18nConfig, RemoteFile } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 测试用例: Pull 命令的 filter 功能
 *
 * 测试场景:
 * 1. 有两个目录 shop 和 widget
 * 2. filter 只处理 shop 目录
 * 3. 验证只有 shop 的翻译被应用
 */
export async function run() {
  console.log('🧪 测试用例: Pull 命令的 filter 功能\n');

  const testDir = path.join(__dirname, 'source');
  const expectedDir = path.join(__dirname, 'expected');

  // 设置测试配置
  const config: I18nConfig = {
    baseLanguage: 'zh-CN',
    scanPatterns: ['app/(* as app)/locales/(* as locale)/*/*.yml'],
  };

  const logger = Logger.silent();

  try {
    // 步骤 1: 准备测试数据
    await prepareTestData(testDir);

    // 步骤 2: 模拟从 GitLab 获取的数据
    const mockRemoteFiles = createMockRemoteFiles();

    // 步骤 3: 验证翻译（使用 filter）
    const validator = new TranslationValidator(
      config,
      testDir,
      'app/shop/**/*',  // filter: 只处理 shop 目录
      logger
    );

    const { validTranslations, skippedEntries } = await validator.validate(
      mockRemoteFiles.baseFiles,
      mockRemoteFiles.targetFiles,
      'zh-CN',
      'en-US'
    );

    if (validTranslations.length === 0) {
      throw new Error('没有找到有效的翻译');
    }

    // 步骤 4: 合并翻译
    const merger = new TranslationMerger(logger, config, testDir);
    await merger.merge(validTranslations, false, false);

    // 步骤 5: 验证结果 - shop 应该被更新，widget 应该保持不变
    await verifyResults(testDir);

    console.log('✅ 测试通过!');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ 测试失败: ${error.message}`);
    } else {
      console.error('\n❌ 测试失败: 未知错误');
    }
    process.exit(1);
  } finally {
    // 清理测试数据
    await cleanupTestData(testDir);
  }
}

/**
 * 准备测试数据
 */
async function prepareTestData(testDir: string): Promise<void> {
  // shop 目录
  const shopZhDir = path.join(testDir, 'app/shop/locales/zh-CN/entries');
  const shopEnDir = path.join(testDir, 'app/shop/locales/en-US/entries');
  await fs.mkdir(shopZhDir, { recursive: true });
  await fs.mkdir(shopEnDir, { recursive: true });

  // widget 目录
  const widgetZhDir = path.join(testDir, 'app/widget/locales/zh-CN/entries');
  const widgetEnDir = path.join(testDir, 'app/widget/locales/en-US/entries');
  await fs.mkdir(widgetZhDir, { recursive: true });
  await fs.mkdir(widgetEnDir, { recursive: true });

  // shop 基础语言文件
  const shopBaseContent = {
    'shop.title': '商店标题',
    'shop.desc': '商店描述',
  };
  await fs.writeFile(
    path.join(shopZhDir, 'translations.yml'),
    Object.entries(shopBaseContent).map(([k, v]) => `${k}: "${v}"`).join('\n')
  );

  // shop 目标语言文件（空）
  const shopTargetContent = {
    'shop.title': '',
    'shop.desc': '',
  };
  await fs.writeFile(
    path.join(shopEnDir, 'translations.yml'),
    Object.entries(shopTargetContent).map(([k, v]) => `${k}: "${v}"`).join('\n')
  );

  // widget 基础语言文件
  const widgetBaseContent = {
    'widget.title': '组件标题',
    'widget.desc': '组件描述',
  };
  await fs.writeFile(
    path.join(widgetZhDir, 'translations.yml'),
    Object.entries(widgetBaseContent).map(([k, v]) => `${k}: "${v}"`).join('\n')
  );

  // widget 目标语言文件（空）
  const widgetTargetContent = {
    'widget.title': '',
    'widget.desc': '',
  };
  await fs.writeFile(
    path.join(widgetEnDir, 'translations.yml'),
    Object.entries(widgetTargetContent).map(([k, v]) => `${k}: "${v}"`).join('\n')
  );
}

/**
 * 创建模拟的远程文件数据
 */
function createMockRemoteFiles(): {
  baseFiles: RemoteFile[];
  targetFiles: RemoteFile[];
} {
  // 模拟 shop 的远程文件
  const baseFiles: RemoteFile[] = [
    {
      path: 'app/shop/locales/zh-CN/entries/translations.yml',
      content: {
        'shop.title': '商店标题',
        'shop.desc': '商店描述',
      },
      language: 'zh-CN',
    },
  ];

  // 模拟 shop 的翻译
  const targetFiles: RemoteFile[] = [
    {
      path: 'app/shop/locales/en-US/entries/translations.yml',
      content: {
        'shop.title': 'Shop Title',
        'shop.desc': 'Shop Desc',
      },
      language: 'en-US',
    },
  ];

  return { baseFiles, targetFiles };
}

/**
 * 验证结果
 */
async function verifyResults(testDir: string): Promise<void> {
  // shop 应该被更新
  const shopContent = await fs.readFile(
    path.join(testDir, 'app/shop/locales/en-US/entries/translations.yml'),
    'utf-8'
  );

  if (!shopContent.includes('shop.title: "Shop Title"')) {
    throw new Error('shop 翻译未被应用');
  }

  // widget 应该保持不变（空值）
  const widgetContent = await fs.readFile(
    path.join(testDir, 'app/widget/locales/en-US/entries/translations.yml'),
    'utf-8'
  );

  if (widgetContent.includes('widget.title: "Widget Title"')) {
    throw new Error('widget 不应该被更新（filter 应该排除它）');
  }

  if (!widgetContent.includes('widget.title: ""')) {
    throw new Error('widget 应该保持空值');
  }
}

/**
 * 清理测试数据
 */
async function cleanupTestData(testDir: string): Promise<void> {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}
