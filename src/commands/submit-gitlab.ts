import { Command } from 'commander';
import { SubmissionExtractor } from '../core/submission-extractor';
import { GitLabClient } from '../core/gitlab-client';
import { loadConfig } from '../config/config-loader';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { fileExists } from '../utils/file-utils';
import * as fs from 'fs/promises';

export const command = new Command('submit-gitlab')
  .description('提取待翻译词条并提交到 GitLab')
  .option('--target <language>', '目标语言代码 (例如: en-US)')
  .option('--filter <path>', '过滤到特定目录 (例如: app/shop)')
  .option('--force', '强制覆盖已存在的输出目录')
  .option('--apply', '提取后提交到 GitLab')
  .option('--dedup', '启用去重功能（相同文案只提交一次）')
  .option('--no-dedup', '禁用去重功能')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .action(async (options) => {
    try {
      const logger = new Logger(options.verbose, false);

      // 解析配置文件路径
      const configPath = path.resolve(options.config);
      const configDir = path.dirname(configPath);

      logger.section('\n🚀 i18n-translate-tool submit-gitlab');

      // 加载配置
      const config = await loadConfig(configDir, configPath);
      const basePath = configDir;

      // 如果没有指定 target，使用配置文件中的默认值
      const target = options.target || config.defaultTarget || 'en-US';

      // 获取输出目录
      const outputDir = path.join(
        basePath,
        config.submission?.outputDir || 'i18n-translate-submission'
      );

      // 检查是否需要提取
      const outputDirExists = await fileExists(outputDir);

      if (!outputDirExists) {
        // 输出目录不存在，执行提取
        logger.info(`输出目录不存在，执行提取...`);

        // 创建提取器
        const extractor = new SubmissionExtractor(
          {
            target: target,
            basePath,
            filter: options.filter,
            verbose: options.verbose,
            deduplication: options.dedup ?? config.submission?.deduplication?.enabled ?? false,
          },
          config,
          logger
        );

        // 执行提取
        const result = await extractor.extract(
          config.scanPatterns,
          config.baseLanguage,
          target,
          outputDir
        );

        if (result.fileCount === 0) {
          logger.warn('没有找到待翻译的词条，退出');
          return;
        }
      } else {
        // 输出目录存在，检查是否有文件
        const entries = await fs.readdir(outputDir, { withFileTypes: true });
        const hasFiles = entries.some(entry => entry.isFile());

        if (!hasFiles) {
          // 目录为空（没有文件），直接删除并重新生成
          logger.info(`输出目录为空，删除并重新生成: ${outputDir}`);
          await fs.rm(outputDir, { recursive: true, force: true });

          // 创建提取器
          const extractor = new SubmissionExtractor(
            {
              target: target,
              basePath,
              filter: options.filter,
              verbose: options.verbose,
              deduplication: options.dedup ?? config.submission?.deduplication?.enabled ?? false,
            },
            config,
            logger
          );

          // 执行提取
          const result = await extractor.extract(
            config.scanPatterns,
            config.baseLanguage,
            target,
            outputDir
          );

          if (result.fileCount === 0) {
            logger.warn('没有找到待翻译的词条，退出');
            return;
          }
        } else if (options.force) {
          logger.info(`清空输出目录: ${outputDir}`);
          await SubmissionExtractor.clearOutputDir(outputDir);

          // 创建提取器
          const extractor = new SubmissionExtractor(
            {
              target: target,
              basePath,
              filter: options.filter,
              verbose: options.verbose,
              deduplication: options.dedup ?? config.submission?.deduplication?.enabled ?? false,
            },
            config,
            logger
          );

          // 执行提取
          const result = await extractor.extract(
            config.scanPatterns,
            config.baseLanguage,
            target,
            outputDir
          );

          if (result.fileCount === 0) {
            logger.warn('没有找到待翻译的词条，退出');
            return;
          }
        } else if (!options.apply) {
          // 目录有文件，且没有 --force 或 --apply
          throw new Error(
            `输出目录已存在: ${outputDir}\n` +
            `使用 --force 强制覆盖并重新提取，或使用 --apply 直接提交`
          );
        } else {
          logger.info(`使用现有输出目录: ${outputDir}`);
        }
      }

      // 如果没有 --apply 标志，到此结束
      if (!options.apply) {
        logger.section('\n✅ 提取完成');
        logger.info(`输出目录: ${outputDir}`);
        logger.info('\n📝 检查并确认翻译内容后，运行:');
        logger.info(`  i18n-translate-tool submit-gitlab --apply`);
        return;
      }

      // 检查 GitLab 配置
      if (!config.submission?.gitlab) {
        throw new Error('GitLab 配置未找到，请在配置文件中设置 submission.gitlab');
      }

      const gitlabConfig = config.submission.gitlab;

      if (!gitlabConfig.token) {
        throw new Error(
          'GitLab token 未设置，请在配置文件中设置 submission.gitlab.token ' +
          '或使用环境变量 GITLAB_TOKEN'
        );
      }

      // 创建 GitLab 客户端
      const gitlabClient = new GitLabClient(gitlabConfig, logger);

      // 检查访问权限
      logger.section('\n🔐 检查 GitLab 访问权限...');
      const hasAccess = await gitlabClient.checkAccess();
      if (!hasAccess) {
        throw new Error(
          `无法访问 GitLab 项目: ${gitlabConfig.projectId}\n` +
          `请检查 URL 和 token 是否正确`
        );
      }
      logger.success('GitLab 访问权限验证成功');

      // 生成分支名称
      const branchName = GitLabClient.generateBranchName();
      logger.info(`分支名称: ${branchName}`);

      // 创建分支
      logger.section('\n🌿 创建分支...');
      const baseBranch = gitlabConfig.baseBranch || 'main';
      logger.info(`基线分支: ${baseBranch}`);
      await gitlabClient.createBranch(branchName, baseBranch);

      // 准备文件
      logger.section('\n📁 准备文件...');
      const mappingFileName = config.submission?.deduplication?.mappingFileName || '_translation-mapping.yml';
      const { files, mappingFile } = await GitLabClient.prepareFiles(outputDir, gitlabConfig.basePath, mappingFileName);

      logger.info(`找到 ${files.length} 个文件`);
      if (mappingFile) {
        logger.info(`映射文件: ${mappingFile.path}`);
      }

      if (files.length === 0 && !mappingFile) {
        logger.warn('没有文件可提交');
        return;
      }

      // 提交文件
      let allFiles = [...files];
      if (mappingFile) {
        allFiles = [...files, mappingFile];
      }

      const commitCount = await gitlabClient.commitFiles(allFiles, branchName);

      logger.section('\n✅ 提交完成');
      logger.info(`分支: ${branchName}`);
      logger.info(`提交文件: ${commitCount}`);
      logger.info(`\n🔗 在 GitLab 上查看分支:`);
      logger.info(await gitlabClient.getBranchUrl(branchName));
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\n❌ 错误: ${error.message}`);
      }
      process.exit(1);
    }
  });
