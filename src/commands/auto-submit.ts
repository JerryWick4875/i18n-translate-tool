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
import { I18nConfig, AutoSubmitState } from '../types';

// 状态文件路径
const STATE_FILE = '.i18n-submit-state.json';
const STATE_VERSION = '1.0';

/**
 * 自动提交命令选项
 */
interface AutoSubmitOptions {
  target?: string;
  filter?: string | string[];
  config?: string;
  verbose?: boolean;
  xanaduProjectId?: string;
  createXanaduProjectName?: string;
  productId?: string;
  preview?: boolean; // 预览模式：只执行到提取本地
  continue?: boolean; // 继续模式：从状态文件读取并继续
  abort?: boolean; // 中止模式：删除预览生成的文件和状态
}

export const command = new Command('auto-submit')
  .description('自动执行完整流程：同步 -> 复用 -> 提交 GitLab -> 提交 Xanadu')
  .option('--target <language>', '目标语言代码（默认使用配置文件中的 defaultTarget）')
  .option('--filter <paths...>', '过滤到特定目录（可多个，例如: app/shop 或 app/shop app/admin）')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .option('--xanadu-project-id <id>', '使用已有 Xanadu 项目')
  .option('--create-xanadu-project-name <name>', '创建新的 Xanadu 项目并指定名称（如: XDR-1.0.0）')
  .option('--product-id <id>', '产品 ID（创建项目时使用）')
  .option('--preview', '预览模式：只执行同步、复用和提取，不提交到 GitLab')
  .option('--continue', '继续模式：读取预览状态并继续提交到 GitLab 和 Xanadu')
  .option('--abort', '中止模式：删除预览生成的文件和状态')
  .action(async (options: AutoSubmitOptions) => {
    const logger = new Logger(options.verbose || false, false);

    // 检查互斥参数
    const modeCount = [options.preview, options.continue, options.abort].filter(Boolean).length;
    if (modeCount > 1) {
      console.error('\n❌ 错误: --preview、--continue 和 --abort 不能同时使用');
      process.exit(1);
    }

    // --abort 模式
    if (options.abort) {
      await runAbort(logger);
      return;
    }

    // --continue 模式
    if (options.continue) {
      await runContinue(logger);
      return;
    }

    // 正常模式或预览模式
    await runAutoSubmit(options, logger);
  });

/**
 * 正常模式或预览模式
 */
async function runAutoSubmit(options: AutoSubmitOptions, logger: Logger) {
  const isPreview = options.preview || false;

  try {
    logger.section('\n🚀 i18n-translate-tool auto-submit' + (isPreview ? ' (预览模式)' : ''));

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
    validateConfig(config, options, isPreview);
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

    // 步骤3: 提取文件到本地
    logger.section('\n📋 步骤 3/4: 提取文件到本地...');
    const outputDir = await runExtract(config, basePath, target, options.filter, logger);
    logger.success(`提取完成，输出目录: ${outputDir}`);

    // 预览模式：保存状态并退出
    if (isPreview) {
      await saveState({
        version: STATE_VERSION,
        configPath: options.config || '.i18n-translate-tool-config.js',
        basePath,
        target,
        filter: typeof options.filter === 'string' ? [options.filter] : options.filter,
        outputDir,
        branchName: GitLabClient.generateBranchName(),
        xanaduProjectId: options.xanaduProjectId,
        createXanaduProjectName: options.createXanaduProjectName,
        productId: options.productId,
        createdAt: new Date().toISOString(),
      }, logger);

      logger.section('\n✅ 预览完成');
      logger.info('本地文件已生成，请检查确认');
      logger.info('\n📝 确认无误后，运行以下命令继续:');
      logger.info('  i18n-translate-tool auto-submit --continue');
      return;
    }

    // 正常模式：继续执行 GitLab 和 Xanadu 提交
    const branchName = GitLabClient.generateBranchName();
    await runSubmitGitlab(config, outputDir, branchName, logger);
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
}

/**
 * --continue 模式：读取状态并继续
 */
async function runContinue(logger: Logger) {
  try {
    logger.section('\n🚀 i18n-translate-tool auto-submit --continue');

    // 读取状态文件
    const state = await loadState(logger);
    logger.info(`读取状态文件: ${STATE_FILE}`);
    logger.info(`状态创建时间: ${state.createdAt}`);
    logger.info(`目标语言: ${state.target}`);

    // 重新加载配置（以防配置文件有更新）
    const configPath = path.resolve(state.configPath);
    const config = await loadConfig(state.basePath, configPath);

    // 验证配置
    validateConfig(config, {
      xanaduProjectId: state.xanaduProjectId,
      createXanaduProjectName: state.createXanaduProjectName,
      productId: state.productId,
    }, false);
    logger.success('配置验证通过');

    // 检查输出目录是否存在
    try {
      await fs.access(state.outputDir);
    } catch {
      throw new Error(`输出目录不存在: ${state.outputDir}\n请先运行 auto-submit --preview`);
    }

    // 提交到 GitLab
    logger.section('\n📋 提交到 GitLab...');
    await runSubmitGitlab(config, state.outputDir, state.branchName, logger);
    logger.success(`GitLab 提交完成，分支: ${state.branchName}`);

    // 提交到 Xanadu
    logger.section('\n📋 提交到 Xanadu...');
    await runSubmitXanadu(config, state.basePath, state.target, state.branchName, {
      xanaduProjectId: state.xanaduProjectId,
      createXanaduProjectName: state.createXanaduProjectName,
      productId: state.productId,
    }, logger);
    logger.success('Xanadu 提交完成');

    // 删除状态文件
    await fs.unlink(path.join(state.basePath, STATE_FILE));
    logger.info(`已删除状态文件: ${STATE_FILE}`);

    // 完成
    logger.section('\n✅ 全部流程执行完成');
    logger.info(`分支: ${state.branchName}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ 错误: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * 保存状态到文件
 */
async function saveState(state: AutoSubmitState, logger: Logger): Promise<void> {
  const statePath = path.join(state.basePath, STATE_FILE);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  logger.info(`状态已保存到: ${statePath}`);
}

/**
 * 从文件加载状态
 */
async function loadState(logger: Logger): Promise<AutoSubmitState> {
  // 查找状态文件（当前目录及父目录）
  let currentDir = process.cwd();
  let statePath = '';
  let stateData: string | null = null;

  while (currentDir !== path.parse(currentDir).root) {
    const testPath = path.join(currentDir, STATE_FILE);
    try {
      const content = await fs.readFile(testPath, 'utf-8');
      statePath = testPath;
      stateData = content;
      break;
    } catch {
      // 文件不存在，继续向上查找
    }
    currentDir = path.dirname(currentDir);
  }

  if (!stateData) {
    throw new Error(
      `找不到状态文件: ${STATE_FILE}\n` +
      `请先运行 auto-submit --preview`
    );
  }

  const state: AutoSubmitState = JSON.parse(stateData);

  // 验证版本
  if (state.version !== STATE_VERSION) {
    throw new Error(
      `状态文件版本不匹配 (预期: ${STATE_VERSION}, 实际: ${state.version})\n` +
      `请删除状态文件并重新运行 auto-submit --preview`
    );
  }

  return state;
}

/**
 * --abort 模式：删除预览生成的文件和状态
 */
async function runAbort(logger: Logger): Promise<void> {
  try {
    logger.section('\n🚀 i18n-translate-tool auto-submit --abort');

    // 读取状态文件
    const state = await loadState(logger);
    logger.info(`状态创建时间: ${state.createdAt}`);
    logger.info(`输出目录: ${state.outputDir}`);

    // 删除输出目录
    logger.section('\n📁 删除输出目录...');
    try {
      await fs.rm(state.outputDir, { recursive: true, force: true });
      logger.success(`已删除: ${state.outputDir}`);
    } catch (error) {
      logger.warn(`删除输出目录失败（可能已不存在）: ${state.outputDir}`);
    }

    // 删除状态文件
    logger.section('\n📄 删除状态文件...');
    const statePath = path.join(state.basePath, STATE_FILE);
    await fs.unlink(statePath);
    logger.success(`已删除: ${statePath}`);

    logger.section('\n✅ 中止完成');
    logger.info('预览生成的文件和状态已清理');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ 错误: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * 验证配置
 */
function validateConfig(config: I18nConfig, options: Partial<AutoSubmitOptions>, isPreview: boolean): void {
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

  // 验证 submission.outputDir
  if (!config.submission?.outputDir) {
    errors.push('submission.outputDir 未配置');
  }

  // 非预览模式下，验证 GitLab 和 Xanadu 配置
  if (!isPreview) {
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
  filter: string | string[] | undefined,
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
    config.snapshot.pathPattern,
    logger
  );

  const snapshotDir = path.join(basePath, config.snapshot.dir);

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
  filter: string | string[] | undefined,
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
 * 执行文件提取（不提交 GitLab）
 * 返回输出目录路径
 */
async function runExtract(
  config: I18nConfig,
  basePath: string,
  target: string,
  filter: string | string[] | undefined,
  logger: Logger
): Promise<string> {
  const outputDir = path.join(basePath, config.submission!.outputDir!);

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

  return outputDir;
}

/**
 * 执行 GitLab 提交
 */
async function runSubmitGitlab(
  config: I18nConfig,
  outputDir: string,
  branchName: string,
  logger: Logger
): Promise<void> {
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
}

/**
 * 执行 Xanadu 提交
 */
async function runSubmitXanadu(
  config: I18nConfig,
  basePath: string,
  target: string,
  branchName: string,
  options: Partial<AutoSubmitOptions>,
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
