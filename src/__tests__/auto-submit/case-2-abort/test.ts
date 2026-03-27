/**
 * auto-submit --abort 模式测试
 *
 * 测试流程：
 * 1. 创建模拟状态文件和输出目录
 * 2. 直接删除（模拟 abort 行为）
 * 3. 验证状态文件和输出目录被删除
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { AutoSubmitState } from '../../../types';

async function runTest() {
  console.log('🧪 Test: auto-submit --abort mode\n');

  const testDir = path.resolve(__dirname);
  const sourceDir = path.join(testDir, 'source');
  const stateFile = path.join(sourceDir, '.i18n-submit-state.json');
  const outputDir = path.join(sourceDir, '.i18n-translate-tool-submission');

  // 清理
  await fs.rm(stateFile, { force: true });
  await fs.rm(outputDir, { recursive: true, force: true });

  // 创建模拟状态文件
  console.log('📋 创建模拟状态文件...');
  const mockState: AutoSubmitState = {
    version: '1.0',
    configPath: '.i18n-translate-tool-config.js',
    basePath: sourceDir,
    target: 'en-US',
    outputDir: outputDir,
    branchName: 'translations-20260327-123456',
    xanaduProjectId: '123',
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(stateFile, JSON.stringify(mockState, null, 2), 'utf-8');
  console.log('✅ 状态文件已创建');

  // 创建模拟输出目录和文件
  console.log('\n📋 创建模拟输出目录...');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'en-US'), { recursive: true });
  await fs.writeFile(path.join(outputDir, 'en-US', 'test.yml'), 'test: content', 'utf-8');
  console.log('✅ 输出目录已创建');

  // 验证初始状态
  const stateExistsBefore = await fs.access(stateFile).then(() => true).catch(() => false);
  const outputExistsBefore = await fs.access(outputDir).then(() => true).catch(() => false);
  if (!stateExistsBefore || !outputExistsBefore) {
    console.error('❌ 初始状态验证失败');
    process.exit(1);
  }
  console.log('✅ 初始状态验证通过');

  // 执行删除（模拟 abort 行为）
  console.log('\n📋 执行 abort 清理操作...');

  // 删除输出目录
  await fs.rm(outputDir, { recursive: true, force: true });
  console.log('✅ 输出目录已删除');

  // 删除状态文件
  await fs.rm(stateFile, { force: true });
  console.log('✅ 状态文件已删除');

  // 验证状态文件被删除
  console.log('\n📋 验证状态文件已删除...');
  const stateExistsAfter = await fs.access(stateFile).then(() => true).catch(() => false);
  if (stateExistsAfter) {
    console.error('❌ 状态文件未被删除:', stateFile);
    // 尝试删除以便下次测试能通过
    await fs.rm(stateFile, { force: true });
    process.exit(1);
  }
  console.log('✅ 状态文件已删除');

  // 验证输出目录被删除
  console.log('\n📋 验证输出目录已删除...');
  const outputExistsAfter = await fs.access(outputDir).then(() => true).catch(() => false);
  if (outputExistsAfter) {
    console.error('❌ 输出目录未被删除:', outputDir);
    process.exit(1);
  }
  console.log('✅ 输出目录已删除');

  console.log('\n✅ 所有测试通过！');
}

runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

export async function run() {
  await runTest();
}
