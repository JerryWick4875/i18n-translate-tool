import { Command } from 'commander';
import { loadConfig } from '../config/config-loader';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { XanaduClient } from '../core/xanadu-client';
import { GitLabFetcher } from '../core/gitlab-fetcher';

/**
 * 命令行选项
 */
interface SubmitXanaduOptions {
  branch: string;
  xanaduProjectId?: string;
  createProject?: boolean;
  productId?: string;
  projectName?: string;
  target?: string;
  config?: string;
  verbose?: boolean;
}

export const command = new Command('submit-xanadu')
  .description('将 GitLab 翻译分支同步到 Xanadu 翻译平台')
  .requiredOption('--branch <name>', 'GitLab 分支名称')
  .option('--xanadu-project-id <id>', 'Xanadu 项目 ID（已有项目时使用）')
  .option('--create-project', '创建新项目')
  .option('--product-id <id>', '产品 ID（创建项目时使用）')
  .option('--project-name <name>', '项目名称（创建项目时使用，如: XDR-1.0.0）')
  .option('--target <language>', '目标语言代码', 'en-US')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .action(async (options: SubmitXanaduOptions) => {
    try {
      const logger = new Logger(options.verbose, false);

      logger.section('\n🚀 i18n-tool submit-xanadu');

      // 验证参数
      validateOptions(options);

      // 解析配置文件路径
      const configPath = path.resolve(options.config!);
      const configDir = path.dirname(configPath);

      // 加载配置
      logger.info('加载配置...');
      const config = await loadConfig(configDir, configPath);

      // 检查 Xanadu 配置
      if (!config.submission?.xanadu) {
        throw new Error('Xanadu 配置未找到，请在配置文件中设置 submission.xanadu');
      }

      // 检查 GitLab 配置
      if (!config.submission?.gitlab) {
        throw new Error('GitLab 配置未找到，请在配置文件中设置 submission.gitlab');
      }

      const gitlabConfig = config.submission.gitlab;
      const xanaduConfig = config.submission.xanadu;

      // 检查 GitLab projectId
      if (!gitlabConfig.projectId || gitlabConfig.projectId === 0) {
        throw new Error(
          'GitLab 项目 ID 未配置，请在配置文件中设置 submission.gitlab.projectId（数字类型）'
        );
      }

      // 获取 Xanadu Token
      const token = process.env.XANADU_TOKEN;
      if (!token) {
        throw new Error(
          'XANADU_TOKEN 环境变量未设置，请设置环境变量: export XANADU_TOKEN=your_token'
        );
      }

      // 从 GitLab 分支提取 YML 路径
      logger.section('\n📡 从 GitLab 分支提取 YML 路径...');
      const fetcher = new GitLabFetcher(gitlabConfig, logger);
      const ymlPaths = await fetcher.extractYmlPaths(options.branch, config.scanPatterns);

      if (ymlPaths.length === 0) {
        throw new Error(
          `在分支 ${options.branch} 中未找到符合 scanPatterns 的 YML 文件\n` +
          `scanPatterns: ${config.scanPatterns.join(', ')}`
        );
      }

      // 用换行符拼接多个路径
      const ymlPathValue = ymlPaths.join('\n');
      logger.info(`找到 ${ymlPaths.length} 个匹配的目录路径:`);
      for (const yp of ymlPaths) {
        logger.info(`  - ${yp}`);
      }

      // 创建 Xanadu 客户端
      const xanaduClient = new XanaduClient(xanaduConfig, gitlabConfig, token, logger);

      // 验证 Token
      logger.section('\n🔐 验证 Xanadu 访问权限...');
      const hasAccess = await xanaduClient.checkAuth();
      if (!hasAccess) {
        throw new Error('Xanadu Token 验证失败，请检查 XANADU_TOKEN 是否正确');
      }
      logger.success('Xanadu 访问权限验证成功');

      // 确定项目 ID
      let projectId: number;

      if (options.createProject) {
        // 场景 B: 创建新项目
        logger.info('创建新项目模式');

        const productId = options.productId ? parseInt(options.productId, 10) : 0;
        const projectName = options.projectName;

        // 创建项目时必须有项目名称
        if (!projectName) {
          throw new Error('创建项目时必须指定 --project-name（项目名称，如: XDR-1.0.0）');
        }

        projectId = await xanaduClient.createProject({
          gitlabProjectId: gitlabConfig.projectId,
          gitlabDomain: gitlabConfig.url,
          sourceLang: xanaduConfig.sourceLang || 'zh-CN',
          targetLang: options.target || xanaduConfig.targetLang || 'en-US',
          productId,
          projectName,
          level: xanaduConfig.project?.level,
          versionType: xanaduConfig.project?.versionType,
          managerId: xanaduConfig.personnel?.managerId,
          translationDockerId: xanaduConfig.personnel?.translationDockerId,
          feDockerId: xanaduConfig.personnel?.feDockerId,
        });
      } else if (options.xanaduProjectId) {
        // 场景 A: 使用已有项目
        logger.info('使用已有项目模式');
        projectId = parseInt(options.xanaduProjectId, 10);
        logger.info(`项目 ID: ${projectId}`);
      } else {
        // 不应该到达这里，因为 validateOptions 已经检查了
        throw new Error('请指定 --xanadu-project-id 或 --create-project');
      }

      // 创建翻译任务
      const result = await xanaduClient.createTask({
        projectId,
        gitlabProjectId: gitlabConfig.projectId,
        gitlabDomain: gitlabConfig.url,
        branchName: options.branch,
        ymlPath: ymlPathValue,
        taskType: xanaduConfig.taskType || 'Front-End',
        sourceLang: xanaduConfig.sourceLang || 'zh-CN',
        targetLang: options.target || xanaduConfig.targetLang || 'en-US',
        prDockerId: xanaduConfig.personnel?.prDockerId,
        translationDockerId: xanaduConfig.personnel?.translationDockerId,
        commitDockerId: xanaduConfig.personnel?.commitDockerId,
      });

      // 输出结果
      logger.section('\n✅ 任务创建完成');
      logger.info(`项目 ID: ${projectId}`);
      logger.info(`分支: ${options.branch}`);
      logger.info(`YML 路径数: ${ymlPaths.length}`);
      logger.info(`目标语言: ${options.target || xanaduConfig.targetLang || 'en-US'}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\n❌ 错误: ${error.message}`);
      }
      process.exit(1);
    }
  });

/**
 * 验证命令行选项
 */
function validateOptions(options: SubmitXanaduOptions): void {
  const errors: string[] = [];

  // 检查分支名称
  if (!options.branch || options.branch.trim() === '') {
    errors.push('--branch 是必需参数');
  }

  // 检查场景参数
  const hasXanaduProjectId = !!options.xanaduProjectId;
  const hasCreateProject = !!options.createProject;

  if (hasXanaduProjectId && hasCreateProject) {
    errors.push('不能同时指定 --xanadu-project-id 和 --create-project，请选择一个');
  }

  if (!hasXanaduProjectId && !hasCreateProject) {
    errors.push('请指定 --xanadu-project-id（使用已有项目）或 --create-project（创建新项目）');
  }

  if (errors.length > 0) {
    throw new Error('参数验证失败:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  }
}
