import { Command } from 'commander';
import { SnapshotManager } from '../core/snapshot-manager';
import { LocaleScanner } from '../core/scanner';
import { YamlHandler } from '../core/yaml-handler';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import { LocaleFile } from '../types';
import * as path from 'path';

export const command = new Command('snapshot')
  .description('创建基础语言的快照用于目标语言')
  .option('--target <language>', '目标语言代码 (例如: en-US)', 'en-US')
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

      const scanner = new LocaleScanner(basePath);
      let files = await scanner.scan(config.scanPatterns);

      if (options.filter) {
        const normalizedFilter = path.normalize(options.filter);
        files = files.filter(f => {
          const relativeDir = path.dirname(f.relativePath);
          return relativeDir.startsWith(normalizedFilter);
        });
        if (files.length === 0) {
          logger.warn(`No files found matching filter: ${options.filter}`);
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
      const pathPattern = config.snapshot?.pathPattern || '{app}/{target}.yml';
      const snapshotManager = new SnapshotManager(snapshotDir, pathPattern);

      for (const [group, groupFiles] of groups) {
        logger.section(`\n📸 Creating snapshot for ${group}...`);

        const baseFiles = scanner.getFilesForAppAndLanguage(
          groupFiles,
          group,
          config.baseLanguage
        );

        if (baseFiles.length === 0) {
          logger.warn(`No ${config.baseLanguage} files found for ${group}`);
          continue;
        }

        const baseData = new Map<string, Record<string, string>>();
        for (const file of baseFiles) {
          baseData.set(file.relativePath, file.content);
          logger.verboseLog(`Found: ${file.relativePath} (${Object.keys(file.content).length} keys)`);
        }

        const variables = baseFiles[0]?.variables || {};

        if (options.dryRun) {
          const snapshotPath = snapshotManager.getSnapshotPath(group, options.target, variables);
          logger.dryRun(`Would create snapshot: ${snapshotPath}`);
          logger.info(`Files: ${baseData.size}, Keys: ${Array.from(baseData.values()).reduce((sum, obj) => sum + Object.keys(obj).length, 0)}`);
        } else {
          await snapshotManager.createSnapshot(group, options.target, baseData, variables);
          logger.success(`Snapshot created: ${options.target} for ${group}`);
        }
      }

      if (options.dryRun) {
        logger.section('\n✅ Dry-run completed (no files written)');
      } else {
        logger.section('\n✅ Snapshot creation completed');
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });
