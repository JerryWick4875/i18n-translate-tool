import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { LocaleFile } from '../types';

/**
 * 用于读取和写入 YAML 文件的处理器
 */
export class YamlHandler {
  /**
   * 加载并解析 YAML 文件
   */
  async loadFile(filePath: string): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, unknown>;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid YAML content in ${filePath}`);
      }

      // 验证扁平结构（无嵌套对象）
      this.validateFlatStructure(parsed, filePath);

      // 将所有值转换为字符串
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === null) {
          result[key] = '';
        } else if (typeof value === 'string') {
          result[key] = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          result[key] = String(value);
        } else {
          throw new Error(`Invalid value type for key "${key}" in ${filePath}: expected string`);
        }
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load YAML file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 加载多个本地化文件的内容
   */
  async loadFiles(files: LocaleFile[]): Promise<LocaleFile[]> {
    const loaded: LocaleFile[] = [];

    for (const file of files) {
      try {
        const content = await this.loadFile(file.path);
        loaded.push({
          ...file,
          content,
        });
      } catch (error) {
        if (error instanceof Error) {
          console.warn(`警告: ${error.message}`);
        }
      }
    }

    return loaded;
  }

  /**
   * 将内容写入 YAML 文件
   * 保持源文件的顺序并使用一致的格式
   */
  async writeFile(
    filePath: string,
    content: Record<string, string>,
    sourceOrder?: string[]
  ): Promise<void> {
    try {
      // 确定键顺序：如果提供了源顺序则使用，否则使用内容键
      const keys = sourceOrder || Object.keys(content);

      // 使用正确格式构建 YAML 内容
      const lines: string[] = [];

      for (const key of keys) {
        if (key in content) {
          const value = content[key];
          // 值使用双引号，空值使用空字符串
          if (value === '') {
            lines.push(`${key}: ""`);
          } else {
            // 如果需要，转义特殊字符
            const escaped = this.escapeYamlString(value);
            lines.push(`${key}: "${escaped}"`);
          }
        }
      }

      const yamlContent = lines.join('\n') + '\n';
      await fs.writeFile(filePath, yamlContent, 'utf-8');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to write YAML file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 转义 YAML 字符串中的特殊字符
   */
  private escapeYamlString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')  // 反斜杠
      .replace(/"/g, '\\"')     // 双引号
      .replace(/\n/g, '\\n')    // 换行符
      .replace(/\r/g, '\\r')    // 回车符
      .replace(/\t/g, '\\t');   // 制表符
  }

  /**
   * 验证 YAML 结构是扁平的（无嵌套对象）
   */
  private validateFlatStructure(data: Record<string, unknown>, filePath: string): void {
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        throw new Error(
          `Nested object detected at key "${key}" in ${filePath}. ` +
          `Only flat key-value pairs are supported.`
        );
      }
    }
  }

  /**
   * 创建文件备份
   */
  async createBackup(filePath: string): Promise<string> {
    const backupPath = `${filePath}.backup`;
    const content = await fs.readFile(filePath, 'utf-8');
    await fs.writeFile(backupPath, content, 'utf-8');
    return backupPath;
  }
}
