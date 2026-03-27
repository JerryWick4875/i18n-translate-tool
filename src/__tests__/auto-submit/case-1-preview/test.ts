/**
 * auto-submit --preview 模式测试
 *
 * 测试流程：
 * 1. 执行 auto-submit --preview
 * 2. 验证状态文件生成
 * 3. 验证输出目录生成
 * 4. 验证状态文件内容正确
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { AutoSubmitState } from '../../../types';

async function runTest() {
  console.log('🧪 Test: auto-submit --preview mode\n');

  const testDir = path.resolve(__dirname);
  const sourceDir = path.join(testDir, 'source');
  const stateFile = path.join(sourceDir, '.i18n-submit-state.json');
  const outputDir = path.join(sourceDir, '.i18n-translate-tool-submission');

  // 清理
  await fs.rm(stateFile, { force: true });
  await fs.rm(outputDir, { recursive: true, force: true });

  // 执行 auto-submit --preview
  console.log('📋 执行 auto-submit --preview...');
  try {
    execSync(
      `npx ts-node ../../../../index.ts auto-submit --preview --config .i18n-translate-tool-config.js --xanadu-project-id 123`,
      {
        cwd: sourceDir,
        stdio: 'inherit',
      }
    );
  } catch (error) {
    console.error('❌ auto-submit --preview 执行失败');
    process.exit(1);
  }

  // 验证状态文件存在
  console.log('\n📋 验证状态文件...');
  const stateExists = await fs.access(stateFile).then(() => true).catch(() => false);
  if (!stateExists) {
    console.error('❌ 状态文件不存在:', stateFile);
    process.exit(1);
  }
  console.log('✅ 状态文件已创建');

  // 验证状态文件内容
  const stateContent = await fs.readFile(stateFile, 'utf-8');
  const state = JSON.parse(stateContent);

  if (state.version !== '1.0') {
    console.error('❌ 状态文件版本不正确:', state.version);
    process.exit(1);
  }
  console.log('✅ 状态文件版本正确');

  if (state.target !== 'en-US') {
    console.error('❌ 目标语言不正确:', state.target);
    process.exit(1);
  }
  console.log('✅ 目标语言正确');

  if (!state.branchName || !state.branchName.startsWith('translations-')) {
    console.error('❌ 分支名不正确:', state.branchName);
    process.exit(1);
  }
  console.log('✅ 分支名正确:', state.branchName);

  if (state.xanaduProjectId !== '123') {
    console.error('❌ Xanadu 项目 ID 不正确:', state.xanaduProjectId);
    process.exit(1);
  }
  console.log('✅ Xanadu 项目 ID 正确');

  if (!state.createdAt) {
    console.error('❌ 创建时间缺失');
    process.exit(1);
  }
  console.log('✅ 创建时间存在');

  // 验证输出目录存在
  console.log('\n📋 验证输出目录...');
  const outputExists = await fs.access(outputDir).then(() => true).catch(() => false);
  if (!outputExists) {
    console.error('❌ 输出目录不存在:', outputDir);
    process.exit(1);
  }
  console.log('✅ 输出目录已创建');

  // 验证输出文件
  console.log('\n📋 验证输出文件...');
  const expectedFiles = [
    'app/shop/config/products/widget/locales/zh-CN/messages.yml',
    'app/shop/config/products/widget/locales/en-US/messages.yml',
  ];

  for (const file of expectedFiles) {
    const filePath = path.join(outputDir, file);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      console.error('❌ 输出文件不存在:', file);
      process.exit(1);
    }
    console.log('✅ 输出文件存在:', file);

    // 验证文件内容不为空
    const content = await fs.readFile(filePath, 'utf-8');
    if (!content || content.trim().length === 0) {
      console.error('❌ 输出文件内容为空:', file);
      process.exit(1);
    }
  }

  console.log('\n✅ 所有测试通过！');
  console.log('\n📁 测试文件已生成，可手动检查:');
  console.log(`   - 状态文件: ${stateFile}`);
  console.log(`   - 输出目录: ${outputDir}`);

  // 清理：删除状态文件和输出目录
  await fs.rm(stateFile, { force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
}

runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

export async function run() {
  await runTest();
}
