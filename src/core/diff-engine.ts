import { SnapshotData, DiffResult } from '../types';

/**
 * 比较旧（快照）与新（当前）翻译数据的引擎
 */
export class DiffEngine {
  /**
   * 比较快照数据与当前基础语言数据
   * 返回归类为新增、更改或删除的更改
   */
  compare(
    snapshotData: SnapshotData | null,
    currentData: SnapshotData
  ): DiffResult {
    const result: DiffResult = {
      added: new Map(),
      changed: new Map(),
      deleted: new Set(),
    };

    // 如果快照不存在，所有当前键都是新的
    if (!snapshotData) {
      for (const [filePath, content] of Object.entries(currentData)) {
        for (const [key, value] of Object.entries(content)) {
          result.added.set(`${filePath}:${key}`, value);
        }
      }
      return result;
    }

    // 从快照中收集所有文件和键
    const snapshotFiles = new Set(Object.keys(snapshotData));
    const currentFiles = new Set(Object.keys(currentData));

    // 检查删除的文件
    for (const file of snapshotFiles) {
      if (!currentFiles.has(file)) {
        // 此文件中的所有键都已删除
        const fileContent = snapshotData[file];
        for (const key of Object.keys(fileContent)) {
          result.deleted.add(`${file}:${key}`);
        }
      }
    }

    // 检查新文件
    for (const file of currentFiles) {
      if (!snapshotFiles.has(file)) {
        // 此文件中的所有键都是新的
        const fileContent = currentData[file];
        for (const [key, value] of Object.entries(fileContent)) {
          result.added.set(`${file}:${key}`, value);
        }
        continue;
      }

      // 比较两个文件中都存在的键
      const snapshotContent = snapshotData[file];
      const currentContent = currentData[file];
      this.compareFileContent(file, snapshotContent, currentContent, result);
    }

    return result;
  }

  /**
   * 比较单个文件的内容
   */
  private compareFileContent(
    filePath: string,
    snapshotContent: Record<string, string>,
    currentContent: Record<string, string>,
    result: DiffResult
  ): void {
    const snapshotKeys = new Set(Object.keys(snapshotContent));
    const currentKeys = new Set(Object.keys(currentContent));

    // 检查删除的键
    for (const key of snapshotKeys) {
      if (!currentKeys.has(key)) {
        result.deleted.add(`${filePath}:${key}`);
      }
    }

    // 检查新增和更改的键
    for (const key of currentKeys) {
      const fullKey = `${filePath}:${key}`;

      if (!snapshotKeys.has(key)) {
        // 新键
        result.added.set(fullKey, currentContent[key]);
      } else {
        // 检查值是否更改
        const oldValue = snapshotContent[key];
        const newValue = currentContent[key];

        if (oldValue !== newValue) {
          result.changed.set(fullKey, { old: oldValue, new: newValue });
        }
      }
    }
  }

  /**
   * 解析完整键（格式："filePath:key"）为各个部分
   */
  parseFullKey(fullKey: string): { filePath: string; key: string } {
    const separatorIndex = fullKey.indexOf(':');

    if (separatorIndex === -1) {
      throw new Error(`Invalid full key format: ${fullKey}`);
    }

    const filePath = fullKey.substring(0, separatorIndex);
    const key = fullKey.substring(separatorIndex + 1);

    return { filePath, key };
  }

  /**
   * 获取特定文件的更改
   */
  getFileChanges(
    result: DiffResult,
    filePath: string
  ): {
    added: Map<string, string>;
    changed: Map<string, { old: string; new: string }>;
    deleted: Set<string>;
  } {
    const added = new Map<string, string>();
    const changed = new Map<string, { old: string; new: string }>();
    const deleted = new Set<string>();

    for (const [fullKey, value] of result.added) {
      const { filePath: fp, key } = this.parseFullKey(fullKey);
      if (fp === filePath) {
        added.set(key, value);
      }
    }

    for (const [fullKey, value] of result.changed) {
      const { filePath: fp, key } = this.parseFullKey(fullKey);
      if (fp === filePath) {
        changed.set(key, value);
      }
    }

    for (const fullKey of result.deleted) {
      const { filePath: fp, key } = this.parseFullKey(fullKey);
      if (fp === filePath) {
        deleted.add(key);
      }
    }

    return { added, changed, deleted };
  }

  /**
   * 检查是否有任何更改
   */
  hasChanges(result: DiffResult): boolean {
    return result.added.size > 0 || result.changed.size > 0 || result.deleted.size > 0;
  }
}
