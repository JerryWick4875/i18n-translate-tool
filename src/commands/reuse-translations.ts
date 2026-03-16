import { Command } from 'commander';
import { ReuseEngine } from '../core/reuse-engine';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import * as path from 'path';

export const command = new Command('reuse')
  .description('复用现有翻译填充空翻译')
  .option('--target <language>', '目标语言代码 (例如: en-US)', 'en-US')
  .option('--filter <path>', '过滤到特定目录 (例如: app/shop)')
  .option('--output <path>', '建议文件输出路径')
  .option('--input <path>', '建议文件输入路径')
  .option('--force', '强制覆盖已存在的建议文件')

  .option('--apply', '应用模式：应用建议文件中的翻译', false)
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .option('--dry-run', '显示更改但不写入文件', false)
  .action(async (options) => {
    try {
      const logger = new Logger(options.verbose, false);
      const cwd = process.cwd();

      const config = await loadConfig(cwd, options.config);
      const basePath = cwd;

      // 确定输出/输入文件路径
      const outputPath = options.output || config.reuse?.outputFile || '.i18ntool-reuse.yml';
      const inputPath = options.input || config.reuse?.outputFile || '.i18ntool-reuse.yml';

      const reuseEngine = new ReuseEngine(
        {
          target: options.target,
          basePath,
          baseLanguage: config.baseLanguage,
          filter: options.filter,
          outputPath,
          inputPath,
          apply: options.apply,
        force: options.force,
          verbose: options.verbose,
          dryRun: options.dryRun,
        },
        logger
      );

      // 判断运行模式
      if (options.apply) {
        if (options.target !== 'en-US') {
          // 一键模式：使用 --apply 和 --target
          logger.section(`\n🚀 One-time mode for ${options.target}...`);

          const result = await reuseEngine.generateAndApply(
            config.scanPatterns,
            config.baseLanguage,
            options.dryRun
          );

          if (result.filledCount > 0 || result.multipleMatchesCount > 0) {
            logger.reuseSummary(
              result.filledCount,
              result.skippedCount,
              result.multipleMatchesCount
            );
          }

          if (result.filledCount > 0) {
            logger.success(`\n✅ Filled ${result.filledCount} translations`);
          } else if (result.multipleMatchesCount > 0) {
            logger.info(`\nℹ️  Found ${result.multipleMatchesCount} items with multiple matches (use generate mode to review)`);
          } else {
            logger.info('\nℹ️  No translations to fill');
          }
        } else {
          // 应用模式：仅应用现有建议文件
          logger.section(`\n📝 Applying translations from ${inputPath}...`);

          const suggestionsData = await reuseEngine.readSuggestionsFile(inputPath);

          const result = await reuseEngine.applyTranslations(
            suggestionsData,
            options.dryRun
          );

          if (result.filledCount > 0 || result.multipleMatchesCount > 0) {
            logger.reuseSummary(
              result.filledCount,
              result.skippedCount,
              result.multipleMatchesCount
            );
          }

          if (result.filledCount > 0) {
            logger.success(`\n✅ Applied ${result.filledCount} translations`);
          } else {
            logger.info('\nℹ️  No translations applied (edit the suggestions file first)');
          }
        }
      } else {
        // 生成模式：生成建议文件
        logger.section(`\n🔍 Generating reuse suggestions for ${options.target}...`);

        await reuseEngine.generateSuggestions(
          config.scanPatterns,
          config.baseLanguage,
          outputPath
        );

        logger.info(`\n📝 Suggestions written to ${outputPath}`);
        logger.info('Edit the file to select from multiple suggestions, then run:');
        logger.info(`  i18n-tool reuse --apply --input ${outputPath}`);
      }

      logger.success('\n✅ Reuse translations completed');
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });
