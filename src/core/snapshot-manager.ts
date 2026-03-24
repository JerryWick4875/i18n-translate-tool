import * as path from 'path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { SnapshotData } from '../types';
import { ensureDir, fileExists, normalizePath } from '../utils/file-utils';

/**
 * 快照管理器，用于创建、读取和删除快照
 */
export class SnapshotManager {
  private snapshotDir: string;
  private pathPattern: string;

  constructor(snapshotDir: string, pathPattern: string = '{app}/{locale}.yml') {
    this.snapshotDir = snapshotDir;
    this.pathPattern = pathPattern;
  }

  /**
   * 获取快照文件路径
   * @param app 应用名称（用于向后兼容）
   * @param targetLanguage 目标语言代码
   * @param variables 扫描模式中的额外变量（如 {module}）
   */
  public getSnapshotPath(
    app: string,
    targetLanguage: string,
    variables: Record<string, string> = {}
  ): string {
    let relativePath = this.pathPattern;

    relativePath = relativePath.replace(/{locale}/g, targetLanguage);

    if (!variables['app']) {
      relativePath = relativePath.replace(/{app}/g, app);
    }

    for (const [key, value] of Object.entries(variables)) {
      relativePath = relativePath.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    // 使用 __default__ 填充未替换的变量
    relativePath = relativePath.replace(/\{[^}]+\}/g, '__default__');

    return path.join(this.snapshotDir, relativePath);
  }

  /**
   * 为特定应用和目标语言创建快照
   * 存储基础语言内容作为未来比较的基准
   */
  async createSnapshot(
    app: string,
    targetLanguage: string,
    baseLanguageData: Map<string, Record<string, string>>,
    variables: Record<string, string> = {}
  ): Promise<void> {
    const snapshotPath = this.getSnapshotPath(app, targetLanguage, variables);
    await ensureDir(path.dirname(snapshotPath));

    const snapshotData: SnapshotData = {};

    for (const [filePath, content] of baseLanguageData) {
      // 规范化路径为正斜杠（跨平台兼容）
      snapshotData[normalizePath(filePath)] = { ...content };
    }

    const yamlContent = yaml.dump(snapshotData, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    });
    await fs.writeFile(snapshotPath, yamlContent, 'utf-8');
  }

  /**
   * 合并快照（用于 filter 场景）
   * 只更新指定的文件，保留快照中其他文件的数据
   */
  async mergeSnapshot(
    app: string,
    targetLanguage: string,
    baseLanguageData: Map<string, Record<string, string>>,
    variables: Record<string, string> = {}
  ): Promise<void> {
    const snapshotPath = this.getSnapshotPath(app, targetLanguage, variables);
    await ensureDir(path.dirname(snapshotPath));

    // 读取现有快照（如果存在）
    let snapshotData: SnapshotData = {};
    if (await fileExists(snapshotPath)) {
      const existingContent = await fs.readFile(snapshotPath, 'utf-8');
      snapshotData = yaml.load(existingContent) as SnapshotData || {};
    }

    // 合并新数据
    for (const [filePath, content] of baseLanguageData) {
      // 规范化路径为正斜杠（跨平台兼容）
      snapshotData[normalizePath(filePath)] = { ...content };
    }

    const yamlContent = yaml.dump(snapshotData, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    });
    await fs.writeFile(snapshotPath, yamlContent, 'utf-8');
  }

  /**
   * 读取现有快照
   */
  async readSnapshot(
    app: string,
    targetLanguage: string,
    variables: Record<string, string> = {}
  ): Promise<SnapshotData | null> {
    const snapshotPath = this.getSnapshotPath(app, targetLanguage, variables);

    if (!(await fileExists(snapshotPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(snapshotPath, 'utf-8');
      return yaml.load(content) as SnapshotData;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read snapshot ${snapshotPath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(
    app: string,
    targetLanguage: string,
    variables: Record<string, string> = {}
  ): Promise<void> {
    const snapshotPath = this.getSnapshotPath(app, targetLanguage, variables);

    if (await fileExists(snapshotPath)) {
      await fs.unlink(snapshotPath);
    }
  }

  /**
   * 检查快照是否存在
   */
  async hasSnapshot(
    app: string,
    targetLanguage: string,
    variables: Record<string, string> = {}
  ): Promise<boolean> {
    const snapshotPath = this.getSnapshotPath(app, targetLanguage, variables);
    return fileExists(snapshotPath);
  }

  /**
   * 列出应用的所有快照
   */
  async listSnapshots(app: string): Promise<string[]> {
    const appSnapshotDir = path.join(this.snapshotDir, app);

    if (!(await fileExists(appSnapshotDir))) {
      return [];
    }

    try {
      const files = await fs.readdir(appSnapshotDir);
      return files
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''));
    } catch {
      return [];
    }
  }

  /**
   * 将基础语言文件数据转换为快照格式
   * 接受文件路径到内容的映射，返回快照数据对象
   */
  prepareSnapshotData(
    files: Array<{ relativePath: string; content: Record<string, string> }>
  ): SnapshotData {
    const snapshotData: SnapshotData = {};

    for (const file of files) {
      // 规范化路径为正斜杠（跨平台兼容）
      snapshotData[normalizePath(file.relativePath)] = { ...file.content };
    }

    return snapshotData;
  }

  /**
   * 获取快照目录路径
   */
  getSnapshotDir(): string {
    return this.snapshotDir;
  }
}
