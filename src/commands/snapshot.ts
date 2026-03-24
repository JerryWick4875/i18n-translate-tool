import { Command } from 'commander';
import { SnapshotManager } from '../core/snapshot-manager';
import { LocaleScanner } from '../core/scanner';
import { YamlHandler } from '../core/yaml-handler';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import { LocaleFile } from '../types';
import { filterFilesByGlob } from '../utils/filter-utils';
import * as path from 'path';

export const command = new Command('snapshot')
  .description('创建基础语言的快照用于目标语言')
  .option('--target <language>', '目标语言代码 (例如: en-US)')
  .option('--filter <paths...>', '过滤到特定目录（可多个，例如: app/shop 或 app/shop app/admin）')
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

      const scanner = new LocaleScanner(basePath);
      let files = await scanner.scan(config.scanPatterns);

      if (options.filter) {
        const filters = Array.isArray(options.filter)
          ? options.filter
          : [options.filter];

        files = await filterFilesByGlob(files, filters, basePath);
        if (files.length === 0) {
          logger.warn(`未找到匹配过滤条件的文件: ${filters.join(', ')}`);
          return;
        }
      }

      const yamlHandler = new YamlHandler();
      const loadedFiles = await yamlHandler.loadFiles(files);

      const groups = new Map<string, LocaleFile[]>();
      for (const file of loadedFiles) {
        let group = file.app;
        if (!groups.has(group)) {
          groups.set(group, []);
        }
        groups.get(group)!.push(file);
      }

      const snapshotDir = path.join(basePath, config.snapshot?.dir || 'i18n-translate-snapshot');
      const pathPattern = config.snapshot?.pathPattern || '{app}/{locale}.yml';
      const snapshotManager = new SnapshotManager(snapshotDir, pathPattern);

      for (const [group, groupFiles] of groups) {
        logger.section(`\n📸 Creating snapshot for ${group}...`);

        const baseFiles = scanner.getFilesForAppAndLanguage(
          groupFiles,
          group,
          config.baseLanguage
        );

        if (baseFiles.length === 0) {
          logger.warn(`未找到 ${group} 的 ${config.baseLanguage} 文件`);
          continue;
        }

        const baseData = new Map<string, Record<string, string>>();
        for (const file of baseFiles) {
          baseData.set(file.relativePath, file.content);
          logger.verboseLog(`找到: ${file.relativePath} (${Object.keys(file.content).length} 个键)`);
        }

        const variables = baseFiles[0]?.variables || {};

        if (options.dryRun) {
          const snapshotPath = snapshotManager.getSnapshotPath(group, target, variables);
          logger.dryRun(`将创建快照: ${snapshotPath}`);
          logger.info(`文件: ${baseData.size}, 键数: ${Array.from(baseData.values()).reduce((sum, obj) => sum + Object.keys(obj).length, 0)}`);
        } else {
          // 有 filter 时使用 mergeSnapshot，保留其他文件的快照数据
          if (options.filter) {
            await snapshotManager.mergeSnapshot(group, target, baseData, variables);
            logger.success(`快照已合并: ${target} for ${group}`);
          } else {
            await snapshotManager.createSnapshot(group, target, baseData, variables);
            logger.success(`快照已创建: ${target} for ${group}`);
          }
        }
      }

      if (options.dryRun) {
        logger.section('\n✅ 试运行完成 (未写入文件)');
      } else {
        logger.section('\n✅ 快照创建完成');
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`错误: ${error.message}`);
      }
      process.exit(1);
    }
  });
