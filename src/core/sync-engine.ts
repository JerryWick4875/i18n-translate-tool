import * as path from 'path';
import * as fs from 'fs/promises';
import { LocaleFile, SyncOptions, SyncResult, SnapshotData } from '../types';
import { LocaleScanner } from './scanner';
import { YamlHandler } from './yaml-handler';
import { SnapshotManager } from './snapshot-manager';
import { DiffEngine } from './diff-engine';
import { Logger } from '../utils/logger';
import { getRelativePath } from '../utils/file-utils';
import { filterFilesByGlob } from '../utils/filter-utils';

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

  constructor(options: SyncOptions, snapshotPathPattern: string = '{app}/{locale}.yml', logger?: Logger) {
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
      const filters = Array.isArray(this.options.filter)
        ? this.options.filter
        : [this.options.filter];

      allFiles = await filterFilesByGlob(allFiles, filters, this.options.basePath);
      if (allFiles.length === 0) {
        this.logger.warn(`No files found matching filters: ${filters.join(', ')}`);
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

      // 读取快照用于识别修改的词条（新增/删除直接对比源文件和目标文件）
      const snapshot = await this.snapshotManager.readSnapshot(app, this.options.target, variables);

      const currentData = this.prepareCurrentData(baseFiles);

      // 对比基础语言和目标语言文件，计算新增和删除
      const fileChangesMap = this.calculateFileChanges(baseFiles, targetFiles, baseLanguage);

      // 使用快照识别修改的词条
      const changedKeys = this.calculateChangedKeys(snapshot, currentData);

      let hasAnyChanges = false;

      for (const baseFile of baseFiles) {
        const relativePath = baseFile.relativePath;
        const fileChanges = fileChangesMap.get(relativePath);

        if (!fileChanges) {
          continue;
        }

        // 合并修改的词条（来自快照对比）
        const fileChanged = changedKeys.get(relativePath);
        if (fileChanged) {
          for (const [key, change] of fileChanged) {
            fileChanges.changed.set(key, change);
          }
        }

        if (
          fileChanges.added.size === 0 &&
          fileChanges.changed.size === 0 &&
          fileChanges.deleted.size === 0
        ) {
          continue;
        }

        hasAnyChanges = true;

        let targetFile = targetFiles.find(
          f => f.relativePath === baseFile.relativePath.replace(baseLanguage, this.options.target)
        );

        // 目标文件不存在时，自动创建
        if (!targetFile) {
          const targetRelativePath = baseFile.relativePath.replace(baseLanguage, this.options.target);
          const targetPath = path.join(this.options.basePath, targetRelativePath);

          if (this.options.dryRun) {
            this.logger.dryRun(`Would create target file ${targetRelativePath}`);
            continue;
          }

          // 确保目录存在
          const targetDir = path.dirname(targetPath);
          await fs.mkdir(targetDir, { recursive: true });

          // 用基础语言的 key 初始化目标文件（值都为空字符串）
          const initialContent: Record<string, string> = {};
          const keyOrder = Object.keys(baseFile.content);
          for (const key of keyOrder) {
            initialContent[key] = '';
          }
          await this.yamlHandler.writeFile(targetPath, initialContent, keyOrder);

          // 创建 LocaleFile 对象供后续使用
          targetFile = {
            path: targetPath,
            relativePath: targetRelativePath,
            language: this.options.target,
            app: baseFile.app,
            variables: baseFile.variables,
            content: initialContent,
          };

          this.logger.success(`Created new target file: ${targetRelativePath} (${keyOrder.length} keys)`);
        }

        // targetFile 此时必定存在
        await this.applyChanges(targetFile, fileChanges, baseFile.variables || {});

        result.fileCount++;
        result.addedCount += fileChanges.added.size;
        result.changedCount += fileChanges.changed.size;
        result.deletedCount += fileChanges.deleted.size;
      }

      if (!hasAnyChanges) {
        this.logger.info('No changes detected');
      }

      // 无论是否有变化，都更新快照以反映当前基础语言的完整状态
      if (!this.options.dryRun) {
        // 有 filter 时使用 mergeSnapshot，保留其他文件的快照数据
        if (this.options.filter) {
          await this.snapshotManager.mergeSnapshot(
            app,
            this.options.target,
            this.prepareSnapshotMap(baseFiles),
            variables
          );
          this.logger.success(`Snapshot merged (filter mode).`);
        } else {
          await this.snapshotManager.createSnapshot(
            app,
            this.options.target,
            this.prepareSnapshotMap(baseFiles),
            variables
          );
          this.logger.success(`Snapshot updated.`);
        }
      }
    }

    return result;
  }

  /**
   * 对比基础语言和目标语言文件，计算新增和删除的词条
   * 不依赖快照，直接对比两个文件的内容
   */
  private calculateFileChanges(
    baseFiles: LocaleFile[],
    targetFiles: LocaleFile[],
    baseLanguage: string
  ): Map<string, { added: Map<string, string>; changed: Map<string, { old: string; new: string }>; deleted: Set<string> }> {
    const result = new Map<string, { added: Map<string, string>; changed: Map<string, { old: string; new: string }>; deleted: Set<string> }>();

    for (const baseFile of baseFiles) {
      const targetFile = targetFiles.find(
        f => f.relativePath === baseFile.relativePath.replace(baseLanguage, this.options.target)
      );

      const baseKeys = new Set(Object.keys(baseFile.content));
      const targetKeys = targetFile ? new Set(Object.keys(targetFile.content)) : new Set<string>();

      const added = new Map<string, string>();
      const deleted = new Set<string>();

      // 新增：基础语言有，目标语言没有
      for (const key of baseKeys) {
        if (!targetKeys.has(key)) {
          added.set(key, baseFile.content[key]);
        }
      }

      // 删除：目标语言有，基础语言没有
      for (const key of targetKeys) {
        if (!baseKeys.has(key)) {
          deleted.add(key);
        }
      }

      result.set(baseFile.relativePath, {
        added,
        changed: new Map(), // 修改单独计算
        deleted,
      });
    }

    return result;
  }

  /**
   * 使用快照识别修改的词条
   * 修改 = 快照中有，且当前值与快照值不同
   */
  private calculateChangedKeys(
    snapshotData: SnapshotData | null,
    currentData: SnapshotData
  ): Map<string, Map<string, { old: string; new: string }>> {
    const result = new Map<string, Map<string, { old: string; new: string }>>();

    if (!snapshotData) {
      return result;
    }

    for (const [filePath, currentContent] of Object.entries(currentData)) {
      const snapshotContent = snapshotData[filePath];
      if (!snapshotContent) {
        continue;
      }

      const changed = new Map<string, { old: string; new: string }>();

      for (const [key, newValue] of Object.entries(currentContent)) {
        if (key in snapshotContent && snapshotContent[key] !== newValue) {
          changed.set(key, { old: snapshotContent[key], new: newValue });
        }
      }

      if (changed.size > 0) {
        result.set(filePath, changed);
      }
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
