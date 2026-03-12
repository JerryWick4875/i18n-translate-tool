import { GitLabClient } from '../../../core/gitlab-client';
import { Logger } from '../../../utils/logger';

/**
 * 测试 GitLab 客户端 legacyUrlFormat 配置
 */
export async function run() {
  const testName = 'GitLab Client - legacyUrlFormat';
  console.log(`\n🧪 Test: ${testName}`);

  const logger = Logger.silent();

  // 测试 1: 新版 URL 格式（默认）
  const modernClient = new GitLabClient(
    {
      url: 'https://gitlab.example.com',
      project: 'group/project',
      token: 'test-token',
      legacyUrlFormat: false,
    },
    logger
  );

  const modernUrl = modernClient.getBranchUrl('translations-20250312-123456');
  const expectedModernUrl =
    'https://gitlab.example.com/group/project/-/tree/translations-20250312-123456';

  if (modernUrl !== expectedModernUrl) {
    console.log('\n❌ 新版 URL 格式测试失败');
    console.log(`预期: ${expectedModernUrl}`);
    console.log(`实际: ${modernUrl}`);
    process.exit(1);
  }
  console.log('  ✅ 新版 URL 格式正确');

  // 测试 2: 老版本 URL 格式
  const legacyClient = new GitLabClient(
    {
      url: 'https://gitlab.old.com',
      project: 'group/project',
      token: 'test-token',
      legacyUrlFormat: true,
    },
    logger
  );

  const legacyUrl = legacyClient.getBranchUrl('translations-20250312-123456');
  const expectedLegacyUrl =
    'https://gitlab.old.com/group/project/tree/translations-20250312-123456';

  if (legacyUrl !== expectedLegacyUrl) {
    console.log('\n❌ 老版本 URL 格式测试失败');
    console.log(`预期: ${expectedLegacyUrl}`);
    console.log(`实际: ${legacyUrl}`);
    process.exit(1);
  }
  console.log('  ✅ 老版本 URL 格式正确');

  // 测试 3: 默认行为（未设置 legacyUrlFormat）
  const defaultClient = new GitLabClient(
    {
      url: 'https://gitlab.default.com',
      project: 'group/project',
      token: 'test-token',
    },
    logger
  );

  const defaultUrl = defaultClient.getBranchUrl('translations-20250312-123456');
  const expectedDefaultUrl =
    'https://gitlab.default.com/group/project/-/tree/translations-20250312-123456';

  if (defaultUrl !== expectedDefaultUrl) {
    console.log('\n❌ 默认 URL 格式测试失败');
    console.log(`预期: ${expectedDefaultUrl}`);
    console.log(`实际: ${defaultUrl}`);
    process.exit(1);
  }
  console.log('  ✅ 默认 URL 格式正确（使用新版格式）');

  console.log(`\n✅ ${testName} passed`);
}
