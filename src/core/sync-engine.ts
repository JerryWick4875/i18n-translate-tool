import * as path from 'path';
import { LocaleFile, SyncOptions, SyncResult, SnapshotData } from '../types';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import { SnapshotManager } from './snapshot-manager';
import { DiffEngine } from './diff-engine';
import { Logger } from '../utils/logger';
import { getRelativePath } from '../utils/file-utils';

/**
 * 主同步引擎，用于编排同步工作流
 */
export class SyncEngine {
  private options: SyncOptions;
  private logger: Logger;
  private scanner: LocaleScanner;
  private yamlHandler: YamlHandler;
  private snapshotManager: SnapshotManager;
  private diffEngine: DiffEngine;
  private snapshotPathPattern: string;

  constructor(options: SyncOptions, snapshotPathPattern: string = '{app}/{target}.yml', logger?: Logger) {
    this.options = options;
    this.snapshotPathPattern = snapshotPathPattern;
    this.logger = logger || new Logger(options.verbose);
    this.scanner = new LocaleScanner(options.basePath);
    this.yamlHandler = new YamlHandler();
    this.diffEngine = new DiffEngine();
    // 一旦有了快照目录就会创建 SnapshotManager
    this.snapshotManager = new SnapshotManager('', this.snapshotPathPattern); // 占位符
  }

  /**
   * Execute the sync workflow
   */
  async sync(
    scanPatterns: string[],
    snapshotDir: string,
    baseLanguage: string
  ): Promise<SyncResult> {
    this.snapshotManager = new SnapshotManager(snapshotDir, this.snapshotPathPattern);

    const result: SyncResult = {
      addedCount: 0,
      changedCount: 0,
      deletedCount: 0,
      fileCount: 0,
      appCount: 0,
    };

    this.logger.verboseLog(`Scanning with patterns: ${scanPatterns.join(', ')}`);
    let allFiles = await this.scanner.scan(scanPatterns);

    if (this.options.filter) {
      const normalizedFilter = path.normalize(this.options.filter);
      allFiles = allFiles.filter(f => {
        const relativeDir = path.dirname(f.relativePath);
        return relativeDir.startsWith(normalizedFilter);
      });
      if (allFiles.length === 0) {
        this.logger.warn(`No files found matching filter: ${this.options.filter}`);
        return result;
      }
    }

    allFiles = await this.yamlHandler.loadFiles(allFiles);

    const uniqueApps = this.scanner.getUniqueApps(allFiles);
    result.appCount = uniqueApps.length;

    for (const app of uniqueApps) {
      this.logger.section(`Processing ${app}...`);

      const baseFiles = this.scanner.getFilesForAppAndLanguage(
        allFiles,
        app,
        baseLanguage
      );

      if (baseFiles.length === 0) {
        this.logger.warn(`No base language (${baseLanguage}) files found for ${app}`);
        continue;
      }

      const targetFiles = this.scanner.getFilesForAppAndLanguage(
        allFiles,
        app,
        this.options.target
      );

      const variables = baseFiles[0]?.variables || {};

      const snapshot = await this.snapshotManager.readSnapshot(app, this.options.target, variables);

      const currentData = this.prepareCurrentData(baseFiles);

      const diff = this.diffEngine.compare(snapshot, currentData);

      if (!this.diffEngine.hasChanges(diff)) {
        this.logger.info('No changes detected');
        continue;
      }

      for (const baseFile of baseFiles) {
        const fileChanges = this.diffEngine.getFileChanges(
          diff,
          baseFile.relativePath
        );

        if (
          fileChanges.added.size === 0 &&
          fileChanges.changed.size === 0 &&
          fileChanges.deleted.size === 0
        ) {
          continue;
        }

        const targetFile = targetFiles.find(
          f => f.relativePath === baseFile.relativePath.replace(baseLanguage, this.options.target)
        );

        if (!targetFile) {
          this.logger.warn(`No target file found for ${baseFile.relativePath}`);
          continue;
        }

        await this.applyChanges(targetFile, fileChanges, baseFile.variables || {});

        result.fileCount++;
        result.addedCount += fileChanges.added.size;
        result.changedCount += fileChanges.changed.size;
        result.deletedCount += fileChanges.deleted.size;
      }

      if (!this.options.dryRun) {
        await this.snapshotManager.createSnapshot(
          app,
          this.options.target,
          this.prepareSnapshotMap(baseFiles),
          variables
        );
      }

      this.logger.success(`Snapshot updated.`);
    }

    return result;
  }

  /**
   * 准备当前数据以进行差异比较
   */
  private prepareCurrentData(files: LocaleFile[]): SnapshotData {
    const data: SnapshotData = {};

    for (const file of files) {
      data[file.relativePath] = { ...file.content };
    }

    return data;
  }

  /**
   * 准备快照数据作为 Map
   */
  private prepareSnapshotMap(
    files: LocaleFile[]
  ): Map<string, Record<string, string>> {
    const map = new Map<string, Record<string, string>>();

    for (const file of files) {
      map.set(file.relativePath, { ...file.content });
    }

    return map;
  }

  /**
   * 将更改应用到目标文件
   */
  private async applyChanges(
    targetFile: LocaleFile,
    changes: {
      added: Map<string, string>;
      changed: Map<string, { old: string; new: string }>;
      deleted: Set<string>;
    },
    variables: Record<string, string> = {}
  ): Promise<void> {
    const relativePath = getRelativePath(targetFile.path, this.options.basePath);
    let updatedContent = { ...targetFile.content };
    const keyOrder = Object.keys(targetFile.content);

    for (const key of changes.deleted) {
      delete updatedContent[key];
      this.logger.logDeletedKey(key, relativePath);
    }

    for (const [key, value] of changes.added) {
      updatedContent[key] = '';
      if (!keyOrder.includes(key)) {
        keyOrder.push(key);
      }
      this.logger.logNewKey(key, relativePath);
    }

    for (const [key, change] of changes.changed) {
      updatedContent[key] = '';
      this.logger.logChangedKey(key, change.old, change.new, relativePath);
    }

    if (this.options.dryRun) {
      this.logger.dryRun(`Would write to ${relativePath}`);
    } else {
      await this.yamlHandler.writeFile(targetFile.path, updatedContent, keyOrder);
    }
  }
}
