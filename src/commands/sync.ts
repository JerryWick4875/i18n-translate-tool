import { Command } from 'commander';
import { SyncEngine } from '../core/sync-engine';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import * as path from 'path';

export const command = new Command('sync')
  .description('同步翻译更改到目标语言')
  .option('--target <language>', '目标语言代码 (例如: en-US)')
  .option('--filter <path>', '过滤到特定目录 (例如: app/shop)')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .option('--dry-run', '显示更改但不写入文件', false)
  .action(async (options) => {
    try {
      const logger = new Logger(options.verbose, false);
      const cwd = process.cwd();

      const config = await loadConfig(cwd, options.config);
      const basePath = cwd;

      // 如果没有指定 target，使用配置文件中的默认值
      const target = options.target || config.defaultTarget || 'en-US';

      logger.section(`\n🔄 同步到 ${target}...`);

      const syncEngine = new SyncEngine(
        {
          target: target,
          basePath,
          filter: options.filter,
          verbose: options.verbose,
          dryRun: options.dryRun,
        },
        config.snapshot?.pathPattern || '{app}/{target}.yml',
        logger
      );

      const snapshotDir = path.join(basePath, config.snapshot?.dir || 'i18n-translate-snapshot');

      const result = await syncEngine.sync(
        config.scanPatterns,
        snapshotDir,
        config.baseLanguage
      );

      if (result.fileCount > 0) {
        logger.summary(
          result.addedCount,
          result.changedCount,
          result.deletedCount
        );
      }

      logger.success('\n✅ 同步完成');
    } catch (error) {
      if (error instanceof Error) {
        console.error(`错误: ${error.message}`);
      }
      process.exit(1);
    }
  });
