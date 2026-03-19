import { Command } from 'commander';
import { SyncEngine } from '../core/sync-engine';
import { ReuseEngine } from '../core/reuse-engine';
import { SubmissionExtractor } from '../core/submission-extractor';
import { GitLabClient } from '../core/gitlab-client';
import { XanaduClient } from '../core/xanadu-client';
import { loadConfig } from '../config/config-loader';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger';
import { I18nConfig } from '../types';

/**
 * 自动提交命令选项
 */
interface AutoSubmitOptions {
  target?: string;
  filter?: string;
  config?: string;
  verbose?: boolean;
  xanaduProjectId?: string;
  createXanaduProjectName?: string;
  productId?: string;
}

export const command = new Command('auto-submit')
  .description('自动执行完整流程：同步 -> 复用 -> 提交 GitLab -> 提交 Xanadu')
  .option('--target <language>', '目标语言代码（默认使用配置文件中的 defaultTarget）')
  .option('--filter <path>', '过滤到特定目录 (例如: app/shop)')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .option('--xanadu-project-id <id>', '使用已有 Xanadu 项目')
  .option('--create-xanadu-project-name <name>', '创建新的 Xanadu 项目并指定名称（如: XDR-1.0.0）')
  .option('--product-id <id>', '产品 ID（创建项目时使用）')
  .action(async (options: AutoSubmitOptions) => {
    const logger = new Logger(options.verbose || false, false);

    try {
      logger.section('\n🚀 i18n-translate-tool auto-submit');

      // 解析配置文件路径
      const configPath = path.resolve(options.config || '.i18n-translate-tool-config.js');
      const configDir = path.dirname(configPath);

      // 加载配置
      logger.info('加载配置...');
      const config = await loadConfig(configDir, configPath);
      const basePath = configDir;

      // 确定目标语言
      const target = options.target || config.defaultTarget || 'en-US';
      logger.info(`目标语言: ${target}`);

      // 前置验证
      logger.section('\n🔍 验证配置...');
      validateConfig(config, options);
      logger.success('配置验证通过');

      // 步骤1: Sync
      logger.section('\n📋 步骤 1/4: 同步翻译...');
      await runSync(config, basePath, target, options.filter, logger);
      logger.success('同步完成');

      // 步骤2: Reuse（只复用唯一值）
      logger.section('\n📋 步骤 2/4: 复用翻译...');
      const reuseResult = await runReuse(config, basePath, target, options.filter, logger);
      if (reuseResult.filledCount > 0) {
        logger.success(`复用完成，填充了 ${reuseResult.filledCount} 个翻译`);
      } else {
        logger.info('没有可复用的唯一匹配翻译');
      }

      // 步骤3: 提交到 GitLab
      logger.section('\n📋 步骤 3/4: 提交到 GitLab...');
      const branchName = await runSubmitGitlab(config, basePath, target, options.filter, logger);
      logger.success(`GitLab 提交完成，分支: ${branchName}`);

      // 步骤4: 提交到 Xanadu
      logger.section('\n📋 步骤 4/4: 提交到 Xanadu...');
      await runSubmitXanadu(config, basePath, target, branchName, options, logger);
      logger.success('Xanadu 提交完成');

      // 完成
      logger.section('\n✅ 全部流程执行完成');
      logger.info(`分支: ${branchName}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\n❌ 错误: ${error.message}`);
      }
      process.exit(1);
    }
  });

/**
 * 验证配置
 */
function validateConfig(config: I18nConfig, options: AutoSubmitOptions): void {
  const errors: string[] = [];

  // 验证基础配置
  if (!config.baseLanguage) {
    errors.push('baseLanguage 未配置');
  }
  if (!config.scanPatterns || config.scanPatterns.length === 0) {
    errors.push('scanPatterns 未配置或为空');
  }
  if (!config.defaultTarget) {
    errors.push('defaultTarget 未配置（用于确定目标语言）');
  }

  // 验证 snapshot 配置
  if (!config.snapshot?.dir) {
    errors.push('snapshot.dir 未配置');
  }
  if (!config.snapshot?.pathPattern) {
    errors.push('snapshot.pathPattern 未配置');
  }

  // 验证 GitLab 配置
  if (!config.submission?.gitlab) {
    errors.push('submission.gitlab 未配置');
  } else {
    const gitlab = config.submission.gitlab;
    if (!gitlab.url) {
      errors.push('submission.gitlab.url 未配置');
    }
    if (!gitlab.projectId || gitlab.projectId === 0) {
      errors.push('submission.gitlab.projectId 未配置');
    }
    if (!gitlab.token && !process.env.GITLAB_TOKEN) {
      errors.push('submission.gitlab.token 未配置且 GITLAB_TOKEN 环境变量未设置');
    }
  }

  // 验证 submission.outputDir
  if (!config.submission?.outputDir) {
    errors.push('submission.outputDir 未配置');
  }

  // 验证 Xanadu 配置
  if (!config.submission?.xanadu) {
    errors.push('submission.xanadu 未配置');
  } else {
    const xanadu = config.submission.xanadu;
    if (!xanadu.url) {
      errors.push('submission.xanadu.url 未配置');
    }
  }

  // 验证 XANADU_COOKIE 环境变量
  if (!process.env.XANADU_COOKIE) {
    errors.push('XANADU_COOKIE 环境变量未设置');
  }

  // 验证 Xanadu 互斥参数
  const hasXanaduProjectId = !!options.xanaduProjectId;
  const hasCreateProjectName = !!options.createXanaduProjectName;
  if (hasXanaduProjectId && hasCreateProjectName) {
    errors.push('不能同时指定 --xanadu-project-id 和 --create-xanadu-project-name');
  }
  if (!hasXanaduProjectId && !hasCreateProjectName) {
    errors.push('请指定 --xanadu-project-id（使用已有项目）或 --create-xanadu-project-name（创建新项目）');
  }

  if (errors.length > 0) {
    throw new Error('配置验证失败:\n' + errors.map(e => `  - ${e}`).join('\n'));
  }
}

/**
 * 执行 Sync
 */
async function runSync(
  config: I18nConfig,
  basePath: string,
  target: string,
  filter: string | undefined,
  logger: Logger
): Promise<void> {
  const syncEngine = new SyncEngine(
    {
      target,
      basePath,
      filter,
      verbose: logger.isVerbose(),
      dryRun: false,
    },
    config.snapshot?.pathPattern || '{app}/{locale}.yml',
    logger
  );

  const snapshotDir = path.join(basePath, config.snapshot?.dir || 'i18n-translate-snapshot');

  const result = await syncEngine.sync(
    config.scanPatterns,
    snapshotDir,
    config.baseLanguage
  );

  if (result.fileCount > 0) {
    logger.summary(result.addedCount, result.changedCount, result.deletedCount);
  }
}

/**
 * 执行 Reuse（只复用唯一值）
 */
async function runReuse(
  config: I18nConfig,
  basePath: string,
  target: string,
  filter: string | undefined,
  logger: Logger
): Promise<{ filledCount: number; multipleMatchesCount: number }> {
  const reuseEngine = new ReuseEngine(
    {
      target,
      basePath,
      baseLanguage: config.baseLanguage,
      filter,
      verbose: logger.isVerbose(),
      dryRun: false,
    },
    logger
  );

  // 使用 generateAndApply 方法，只应用唯一匹配
  const result = await reuseEngine.generateAndApply(
    config.scanPatterns,
    config.baseLanguage,
    false
  );

  return {
    filledCount: result.filledCount,
    multipleMatchesCount: result.multipleMatchesCount,
  };
}

/**
 * 执行 GitLab 提交
 * 返回创建的分支名称
 */
async function runSubmitGitlab(
  config: I18nConfig,
  basePath: string,
  target: string,
  filter: string | undefined,
  logger: Logger
): Promise<string> {
  const gitlabConfig = config.submission!.gitlab!;

  // 创建 GitLab 客户端
  const gitlabClient = new GitLabClient(gitlabConfig, logger);

  // 检查访问权限
  logger.info('检查 GitLab 访问权限...');
  const hasAccess = await gitlabClient.checkAccess();
  if (!hasAccess) {
    throw new Error(`无法访问 GitLab 项目: ${gitlabConfig.projectId}`);
  }
  logger.success('GitLab 访问权限验证成功');

  // 确定输出目录
  const outputDir = path.join(basePath, config.submission?.outputDir || 'i18n-translate-submission');

  // 清空输出目录（如果存在）
  logger.info(`清空输出目录: ${outputDir}`);
  await SubmissionExtractor.clearOutputDir(outputDir);

  // 创建提取器并执行提取
  const extractor = new SubmissionExtractor(
    {
      target,
      basePath,
      filter,
      verbose: logger.isVerbose(),
      deduplication: config.submission?.deduplication?.enabled ?? false,
    },
    config,
    logger
  );

  const result = await extractor.extract(
    config.scanPatterns,
    config.baseLanguage,
    target,
    outputDir
  );

  if (result.fileCount === 0) {
    throw new Error('没有找到待翻译的词条');
  }

  logger.info(`提取完成，找到 ${result.fileCount} 个文件`);

  // 生成分支名称
  const branchName = GitLabClient.generateBranchName();
  logger.info(`分支名称: ${branchName}`);

  // 创建分支
  const baseBranch = gitlabConfig.baseBranch || 'main';
  logger.info(`基线分支: ${baseBranch}`);
  await gitlabClient.createBranch(branchName, baseBranch);

  // 准备文件
  const mappingFileName = config.submission?.deduplication?.mappingFileName || '_translation-mapping.yml';
  const { files, mappingFile } = await GitLabClient.prepareFiles(outputDir, gitlabConfig.basePath, mappingFileName);

  logger.info(`准备提交 ${files.length} 个文件`);
  if (mappingFile) {
    logger.info(`映射文件: ${mappingFile.path}`);
  }

  // 提交文件
  let allFiles = [...files];
  if (mappingFile) {
    allFiles = [...files, mappingFile];
  }

  const commitCount = await gitlabClient.commitFiles(allFiles, branchName);
  logger.info(`提交文件数: ${commitCount}`);

  // 提交成功后删除本地输出目录
  await fs.rm(outputDir, { recursive: true, force: true });
  logger.info(`已删除本地输出目录: ${outputDir}`);

  // 返回分支名称供 Xanadu 使用
  return branchName;
}

/**
 * 执行 Xanadu 提交
 */
async function runSubmitXanadu(
  config: I18nConfig,
  basePath: string,
  target: string,
  branchName: string,
  options: AutoSubmitOptions,
  logger: Logger
): Promise<void> {
  const gitlabConfig = config.submission!.gitlab!;
  const xanaduConfig = config.submission!.xanadu!;

  // 获取 Xanadu Cookie
  const cookie = process.env.XANADU_COOKIE!;

  // 从 GitLab 分支提取 YML 路径
  logger.info('从 GitLab 分支提取 YML 路径...');
  const { GitLabFetcher } = await import('../core/gitlab-fetcher');
  const fetcher = new GitLabFetcher(gitlabConfig, logger);
  const ymlPaths = await fetcher.extractYmlPaths(branchName, config.scanPatterns);

  if (ymlPaths.length === 0) {
    throw new Error(
      `在分支 ${branchName} 中未找到符合 scanPatterns 的 YML 文件`
    );
  }

  const ymlPathValue = ymlPaths.join(',');
  logger.info(`找到 ${ymlPaths.length} 个匹配的目录路径`);

  // 创建 Xanadu 客户端
  const xanaduClient = new XanaduClient(xanaduConfig, gitlabConfig, cookie, logger);

  // 验证 Token
  logger.info('验证 Xanadu 访问权限...');
  const hasAccess = await xanaduClient.checkAuth();
  if (!hasAccess) {
    throw new Error('Xanadu Cookie 验证失败');
  }
  logger.success('Xanadu 访问权限验证成功');

  // 确定项目 ID
  let projectId: number;

  if (options.createXanaduProjectName) {
    // 创建新项目
    logger.info('创建新的 Xanadu 项目...');
    const productId = options.productId
      ? parseInt(options.productId, 10)
      : xanaduConfig.project?.productId ?? 0;

    projectId = await xanaduClient.createProject({
      gitlabProjectId: gitlabConfig.projectId,
      gitlabDomain: gitlabConfig.url,
      sourceLang: xanaduConfig.sourceLang || 'zh-CN',
      targetLang: target || xanaduConfig.targetLang || 'en-US',
      productId,
      projectName: options.createXanaduProjectName,
      level: xanaduConfig.project?.level,
      versionType: xanaduConfig.project?.versionType,
      managerId: xanaduConfig.personnel?.managerId,
      translationDockerId: xanaduConfig.personnel?.translationDockerId,
      feDockerId: xanaduConfig.personnel?.feDockerId,
    });
    logger.success(`项目创建成功，ID: ${projectId}`);
  } else if (options.xanaduProjectId) {
    // 使用已有项目
    projectId = parseInt(options.xanaduProjectId, 10);
    logger.info(`使用已有项目，ID: ${projectId}`);
  } else {
    // 不应该到达这里
    throw new Error('请指定 --xanadu-project-id 或 --create-xanadu-project-name');
  }

  // 创建翻译任务
  logger.info('创建翻译任务...');
  await xanaduClient.createTask({
    projectId,
    gitlabProjectId: gitlabConfig.projectId,
    gitlabDomain: gitlabConfig.url,
    branchName,
    ymlPath: ymlPathValue,
    taskType: xanaduConfig.taskType || 'Front-End',
    sourceLang: xanaduConfig.sourceLang || 'zh-CN',
    targetLang: target || xanaduConfig.targetLang || 'en-US',
    prDockerId: xanaduConfig.personnel?.prDockerId,
    translationDockerId: xanaduConfig.personnel?.translationDockerId,
    commitDockerId: xanaduConfig.personnel?.commitDockerId,
  });
}
