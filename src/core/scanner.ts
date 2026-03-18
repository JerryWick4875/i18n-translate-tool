import * as path from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { LocaleFile, LocaleGroup } from '../types';
import { getRelativePath, normalizePath } from '../utils/file-utils';

/**
 * 带命名通配符信息的解析模式
 */
interface ParsedPattern {
  original: string;
  regex: RegExp;
  variableNames: string[];
}

/**
 * 用于查找和分组本地化文件的扫描器
 */
export class LocaleScanner {
  private basePath: string;
  private parsedPatterns: ParsedPattern[];

  constructor(basePath: string, patterns: string[] = []) {
    this.basePath = path.resolve(basePath);
    this.parsedPatterns = this.parsePatterns(patterns);
  }

  /**
   * 解析模式以提取命名通配符
   * 语法: (* as name) 捕获路径段并将其赋值给变量 'name'
   */
  private parsePatterns(patterns: string[]): ParsedPattern[] {
    return patterns.map(pattern => {
      const variableNames: string[] = [];

      // 将 (* as name) 替换为正则表达式捕获组（必须在转义之前完成）
      // 使用 [^/\\]+ 匹配路径段（同时处理 Unix / 和 Windows \
      let regexStr = pattern
        .replace(/\(\*\s+as\s+([^\/\\\s]+)\)/g, (_, name) => {
          variableNames.push(name);
          return '###CAPTURE###';  // 临时占位符
        })
        // 转义特殊正则表达式字符
        .replace(/[.+?^${}|[\]\\]/g, '\\$&')
        // 替换 ** 和 * 模式（对于 (* as name)，* 已被替换）
        .replace(/\*{2,}/g, '.*')
        .replace(/\*/g, '[^/\\\\]*')
        // 将占位符替换为捕获组 - 匹配任何非路径分隔符字符
        .replace(/###CAPTURE###/g, '([^/\\\\]+)');

      return {
        original: pattern,
        regex: new RegExp('^' + regexStr + '$'),
        variableNames,
      };
    });
  }

  /**
   * 基于模式从文件路径中提取变量
   */
  private extractVariables(filePath: string): { app: string; variables: Record<string, string> } {
    const relativePath = normalizePath(path.relative(this.basePath, filePath));

    for (const parsed of this.parsedPatterns) {
      const match = relativePath.match(parsed.regex);
      if (match) {
        const variables: Record<string, string> = {};
        parsed.variableNames.forEach((name, index) => {
          variables[name] = match[index + 1];
        });

        // 为了向后兼容，{app} 或第一个变量是 'app'
        const app = variables['app'] || parsed.variableNames[0] ? variables[parsed.variableNames[0]] : this.extractDefaultApp(relativePath);

        return { app, variables };
      }
    }

    // 回退：使用旧逻辑提取 app
    const app = this.extractDefaultApp(relativePath);
    return { app, variables: {} };
  }

  /**
   * 向后兼容的默认 app 提取
   */
  private extractDefaultApp(relativePath: string): string {
    // 规范化路径后使用正则匹配（支持 / 和 \）
    const normalizedPath = normalizePath(relativePath);
    const appMatch = normalizedPath.match(/[/\\]([^/\\]+)[/\\]/);
    return appMatch ? appMatch[1] : 'default';
  }

  /**
   * 使用 glob 模式扫描本地化文件
   */
  async scan(patterns: string[]): Promise<LocaleFile[]> {
    // 如果提供了新模式，则重新解析
    if (patterns.length > 0) {
      this.parsedPatterns = this.parsePatterns(patterns);
    }

    const files: LocaleFile[] = [];

    for (const parsed of this.parsedPatterns) {
      // 将模式转换回 glob 供 glob 库使用
      // 将 (* as name) 替换为 * 以进行 glob 匹配
      const globPattern = parsed.original
        .replace(/\(\*\s+as\s+[^\/\\\s]+\)/g, '*');

      const absolutePattern = path.isAbsolute(globPattern)
        ? globPattern
        : path.join(this.basePath, globPattern);

      const matches = await glob(absolutePattern, {
        absolute: true,
        nodir: true,
      });

      for (const filePath of matches) {
        const localeFile = this.createLocaleFile(filePath);
        if (localeFile) {
          files.push(localeFile);
        }
      }
    }

    return files;
  }

  /**
   * 从文件路径创建 LocaleFile 对象
   * 要求扫描模式必须包含 (* as locale) 变量来指定语言代码
   */
  private createLocaleFile(filePath: string): LocaleFile | null {
    const { app, variables } = this.extractVariables(filePath);

    // 语言代码必须从 locale 变量中提取
    const language = variables['locale'];
    if (!language) {
      throw new Error(
        `Scan pattern must include "(* as locale)" to specify language code. ` +
        `File: ${filePath}`
      );
    }

    const relativePath = getRelativePath(filePath, this.basePath);

    // 内容将由 YamlHandler 单独加载
    return {
      path: filePath,
      app,
      language,
      relativePath: normalizePath(relativePath),
      variables,
      content: {},
    };
  }

  /**
   * 按应用和语言分组本地化文件
   */
  groupByAppAndLanguage(files: LocaleFile[]): LocaleGroup[] {
    const grouped = new Map<string, Map<string, LocaleFile[]>>();

    for (const file of files) {
      let appMap = grouped.get(file.app);
      if (!appMap) {
        appMap = new Map();
        grouped.set(file.app, appMap);
      }

      let langArray = appMap.get(file.language);
      if (!langArray) {
        langArray = [];
        appMap.set(file.language, langArray);
      }

      langArray.push(file);
    }

    // 转换为 LocaleGroup 数组
    const result: LocaleGroup[] = [];
    for (const [app, languages] of grouped) {
      const langMap: Record<string, LocaleFile[]> = {};
      for (const [lang, files] of languages) {
        langMap[lang] = files;
      }
      result.push({ app, languages: langMap });
    }

    return result;
  }

  /**
   * 获取特定应用和语言的文件
   */
  getFilesForAppAndLanguage(
    files: LocaleFile[],
    app: string,
    language: string
  ): LocaleFile[] {
    return files.filter(f => f.app === app && f.language === language);
  }

  /**
   * 获取特定应用的文件
   */
  getFilesForApp(files: LocaleFile[], app: string): LocaleFile[] {
    return files.filter(f => f.app === app);
  }

  /**
   * 获取所有唯一的应用名称
   */
  getUniqueApps(files: LocaleFile[]): string[] {
    const apps = new Set(files.map(f => f.app));
    return Array.from(apps).sort();
  }

  /**
   * 获取所有唯一的语言代码
   */
  getUniqueLanguages(files: LocaleFile[]): string[] {
    const langs = new Set(files.map(f => f.language));
    return Array.from(langs).sort();
  }
}
