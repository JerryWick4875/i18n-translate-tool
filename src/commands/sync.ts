import { Command } from 'commander';
import { SyncEngine } from '../core/sync-engine';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import * as path from 'path';

export const command = new Command('sync')
  .description('同步翻译更改到目标语言')
  .option('--target <language>', '目标语言代码 (例如: en-US)', 'en-US')
  .option('--filter <path>', '过滤到特定目录 (例如: app/shop)')
  .option('--config <path>', '配置文件路径', '.i18ntoolrc.js')
  .option('--verbose', '启用详细输出', false)
  .option('--dry-run', '显示更改但不写入文件', false)
  .action(async (options) => {
    try {
      const logger = new Logger(options.verbose, false);
      const cwd = process.cwd();

      const config = await loadConfig(cwd);
      const basePath = cwd;

      logger.section(`\n🔄 Syncing to ${options.target}...`);

      const syncEngine = new SyncEngine(
        {
          target: options.target,
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

      logger.success('\n✅ Sync completed');
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });
