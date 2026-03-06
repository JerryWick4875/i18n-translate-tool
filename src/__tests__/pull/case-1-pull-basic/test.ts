import { GitLabFetcher } from '../../../core/gitlab-fetcher';
import { TranslationValidator } from '../../../core/translation-validator';
import { TranslationMerger } from '../../../core/translation-merger';
import { I18nConfig, RemoteFile } from '../../../types';
import { Logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 测试用例 1: 基本拉取功能
 *
 * 测试场景:
 * 1. 从 GitLab 模拟数据中拉取翻译
 * 2. 验证三重匹配逻辑
 * 3. 合并翻译到本地文件
 */
export async function run() {
  console.log('🧪 测试用例 1: 基本拉取功能\n');

  const testDir = path.join(__dirname, 'source');
  const expectedDir = path.join(__dirname, 'expected');

  // 设置测试配置
  const config: I18nConfig = {
    baseLanguage: 'zh-CN',
    scanPatterns: ['app/(* as app)/locales/(* as locale)/*.yml'],
  };

  const logger = new Logger(true);

  try {
    // 步骤 1: 准备测试数据
    console.log('📁 准备测试数据...');
    await prepareTestData(testDir);

    // 步骤 2: 模拟从 GitLab 获取的数据
    console.log('\n📡 模拟 GitLab 数据...');
    const mockRemoteFiles = createMockRemoteFiles();

    // 步骤 3: 验证翻译
    console.log('\n🔍 验证翻译...');
    const validator = new TranslationValidator(
      config,
      testDir,
      undefined,
      logger
    );

    const { validTranslations, skippedEntries } = await validator.validate(
      mockRemoteFiles.baseFiles,
      mockRemoteFiles.targetFiles,
      'zh-CN',
      'en-US'
    );

    console.log(`  有效翻译: ${validTranslations.length} 个文件`);
    console.log(`  跳过词条: ${skippedEntries.length} 个`);

    if (validTranslations.length === 0) {
      throw new Error('没有找到有效的翻译');
    }

    // 步骤 4: 合并翻译
    console.log('\n💾 合并翻译...');
    const merger = new TranslationMerger(logger);
    const result = await merger.merge(validTranslations, false, false);

    console.log(`  填充词条: ${result.filledCount}`);
    console.log(`  跳过词条: ${result.skippedCount}`);
    console.log(`  修改文件: ${result.fileCount}`);

    // 步骤 5: 验证结果
    console.log('\n✅ 验证结果...');
    await verifyResults(testDir);

    console.log('\n✅ 测试通过!');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ 测试失败: ${error.message}`);
      console.error(error.stack);
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
  // 创建目录结构
  await fs.mkdir(path.join(testDir, 'app/shop/locales/zh-CN'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'app/shop/locales/en-US'), { recursive: true });

  // 写入基础语言文件
  const baseContent = {
    'product.name': '商品名称',
    'product.description': '商品描述',
    'product.price': '价格',
    'cart.title': '购物车',
    'cart.empty': '购物车为空',
  };

  await fs.writeFile(
    path.join(testDir, 'app/shop/locales/zh-CN/translations.yml'),
    Object.entries(baseContent)
      .map(([k, v]) => `${k}: "${v}"`)
      .join('\n')
  );

  // 写入目标语言文件（部分已翻译，部分未翻译）
  const targetContent = {
    'product.name': '',  // 未翻译
    'product.description': 'Product Description',  // 已翻译
    'product.price': '',  // 未翻译
    'cart.title': '',  // 未翻译
    'cart.empty': 'Cart is empty',  // 已翻译
  };

  await fs.writeFile(
    path.join(testDir, 'app/shop/locales/en-US/translations.yml'),
    Object.entries(targetContent)
      .map(([k, v]) => `${k}: "${v}"`)
      .join('\n')
  );
}

/**
 * 创建模拟的远程文件数据
 */
function createMockRemoteFiles(): {
  baseFiles: RemoteFile[];
  targetFiles: RemoteFile[];
} {
  // 模拟 GitLab 上的基础语言文件
  const baseFiles: RemoteFile[] = [
    {
      path: 'app/shop/locales/zh-CN/translations.yml',
      content: {
        'product.name': '商品名称',
        'product.description': '商品描述',
        'product.price': '价格',
        'cart.title': '购物车',
        'cart.empty': '购物车为空',
      },
      language: 'zh-CN',
    },
  ];

  // 模拟 GitLab 上的目标语言文件（翻译人员已翻译）
  const targetFiles: RemoteFile[] = [
    {
      path: 'app/shop/locales/en-US/translations.yml',
      content: {
        'product.name': 'Product Name',
        'product.description': 'Product Description',
        'product.price': 'Price',
        'cart.title': 'Shopping Cart',
        'cart.empty': 'Cart is empty',
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
  // 读取实际结果
  const actualContent = await fs.readFile(
    path.join(testDir, 'app/shop/locales/en-US/translations.yml'),
    'utf-8'
  );

  // 验证关键字段
  const expectedTranslations = {
    'product.name': 'Product Name',
    'product.description': 'Product Description',
    'product.price': 'Price',
    'cart.title': 'Shopping Cart',
    'cart.empty': 'Cart is empty',
  };

  for (const [key, expectedValue] of Object.entries(expectedTranslations)) {
    if (!actualContent.includes(`${key}: "${expectedValue}"`)) {
      console.error('实际内容:', actualContent);
      throw new Error(`翻译不匹配: ${key} 期望 "${expectedValue}"`);
    }
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
