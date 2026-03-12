import { Command } from 'commander';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { GitLabFetcher } from '../core/gitlab-fetcher';
import { TranslationValidator } from '../core/translation-validator';
import { TranslationMerger } from '../core/translation-merger';
import { loadConfig } from '../config/config-loader';
import { PullOptions, PullResult, I18nConfig } from '../types';

export const command = new Command('pull')
  .description('从 GitLab 拉取翻译并填充到本地文件')
  .requiredOption('--branch <branch-name>', 'GitLab 分支名称')
  .option('--target <language>', '目标语言代码', 'en-US')
  .option('--filter <path>', '过滤到特定目录')
  .option('--dry-run', '预览模式，不实际修改文件')
  .option('--force', '强制覆盖已有的翻译值')
  .option('--mapping-file <path>', '映射文件路径')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出')
  .action(async (options) => {
      const logger = new Logger(options.verbose);

      try {
        // 加载配置
        console.log('\n🚀 i18n-tool pull');

        const configPath = path.resolve(options.config);
        const configDir = path.dirname(configPath);
        const config = await loadConfig(configDir, configPath);

        // 验证 GitLab 配置
        if (!config.submission?.gitlab) {
          logger.error('错误: 缺少 GitLab 配置');
          logger.error('请在配置文件中添加 submission.gitlab 配置');
          process.exit(1);
        }

        const { gitlab } = config.submission;

        // 构建选项
        const pullOptions: PullOptions = {
          branch: options.branch,
          target: options.target,
          basePath: configDir,
          filter: options.filter,
          dryRun: !!options.dryRun,
          force: !!options.force,
          verbose: !!options.verbose,
        };

        logger.section('\n📋 配置信息:');
        logger.verboseLog(`分支: ${pullOptions.branch}`);
        logger.verboseLog(`基础语言: ${config.baseLanguage}`);
        logger.verboseLog(`目标语言: ${pullOptions.target}`);
        if (pullOptions.filter) {
          logger.verboseLog(`过滤器: ${pullOptions.filter}`);
        }
        if (pullOptions.dryRun) {
          logger.warn('DRY RUN 模式: 不会实际修改文件');
        }

        // 获取映射文件名
        const mappingFileName = config.submission?.deduplication?.mappingFileName || '_translation-mapping.yml';

        // 步骤 1: 从 GitLab 获取文件
        const fetcher = new GitLabFetcher(gitlab, logger);
        const { baseFiles, targetFiles, mappingFile } = await fetcher.fetchFromBranch(
          pullOptions.branch,
          gitlab.basePath || '',
          config.baseLanguage,
          pullOptions.target,
          mappingFileName
        );

        if (targetFiles.length === 0) {
          logger.warn('\n⚠️  未找到任何目标语言文件');
          logger.info('请检查:');
          logger.info('  1. 分支名称是否正确');
          logger.info('  2. 目标语言代码是否正确');
          logger.info('  3. 分支中是否包含翻译文件');
          process.exit(0);
        }

        if (mappingFile) {
          logger.info(`\n📋 加载映射文件: ${mappingFileName}`);
          logger.info(`  映射条目: ${mappingFile.mappings.length}`);
        }

        // 步骤 2: 验证翻译
        const validator = new TranslationValidator(
          config,
          pullOptions.basePath,
          pullOptions.filter,
          logger
        );
        const { validTranslations, skippedEntries } = await validator.validate(
          baseFiles,
          targetFiles,
          config.baseLanguage,
          pullOptions.target,
          mappingFile
        );

        if (validTranslations.length === 0) {
          logger.warn('\n⚠️  没有有效的翻译可以应用');
          if (skippedEntries.length > 0) {
            logger.warn(`跳过 ${skippedEntries.length} 个词条`);
            logger.section('\n📋 跳过的词条:');
            for (const entry of skippedEntries.slice(0, 10)) {
              logger.warn(`  ${entry.filePath}:${entry.key} - ${entry.reason}`);
            }
            if (skippedEntries.length > 10) {
              logger.warn(`  ... 还有 ${skippedEntries.length - 10} 个`);
            }
          }
          process.exit(0);
        }

        // 创建映射查找索引
        let mappingLookup;
        if (mappingFile) {
          const lookup = new Map<string, any>();
          for (const entry of mappingFile.mappings) {
            const key = `${entry.primaryKey.file}:${entry.primaryKey.key}`;
            lookup.set(key, entry);
          }
          mappingLookup = lookup;
        }

        // 步骤 3: 合并翻译
        const merger = new TranslationMerger(logger, config, pullOptions.basePath);
        const { filledCount, skippedCount, fileCount } = await merger.merge(
          validTranslations,
          pullOptions.force ?? false,
          pullOptions.dryRun ?? false,
          mappingLookup
        );

        // 输出结果
        const result: PullResult = {
          filledCount,
          skippedCount: skippedCount + skippedEntries.length,
          fileCount,
          skippedEntries,
        };

        logger.section('\n✅ 拉取完成');
        logger.info(`  填充词条: ${result.filledCount}`);
        logger.info(`  跳过词条: ${result.skippedCount}`);
        logger.info(`  修改文件: ${result.fileCount}`);

        if (result.skippedEntries.length > 0) {
          logger.section('\n📋 跳过的词条:');
          const skippedByReason = new Map<string, typeof skippedEntries>();
          for (const entry of result.skippedEntries) {
            if (!skippedByReason.has(entry.reason)) {
              skippedByReason.set(entry.reason, []);
            }
            skippedByReason.get(entry.reason)!.push(entry);
          }

          for (const [reason, entries] of skippedByReason.entries()) {
            logger.verboseLog(`\n${reason} (${entries.length}):`);
            for (const entry of entries.slice(0, 5)) {
              const shortPath = entry.filePath.length > 50
                ? '...' + entry.filePath.slice(-47)
                : entry.filePath;
              logger.verboseLog(`  - ${shortPath}: ${entry.key}`);
            }
            if (entries.length > 5) {
              logger.verboseLog(`  ... 还有 ${entries.length - 5} 个`);
            }
          }
        }

      } catch (error) {
        if (error instanceof Error) {
          logger.error(`\n❌ 错误: ${error.message}`);
          if (options.verbose && error.stack) {
            logger.verboseLog(error.stack);
          }
        } else {
          logger.error('\n❌ 未知错误');
        }
        process.exit(1);
      }
    });

