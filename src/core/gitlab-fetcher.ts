import { Gitlab } from '@gitbeaker/rest';
import { Logger } from '../utils/logger';
import { GitLabConfig, RemoteFile, TranslationMapping } from '../types';
import * as yaml from 'js-yaml';
import * as path from 'path';

/**
 * GitLab 文件获取器
 * 从 GitLab 仓库的指定分支拉取翻译文件
 */
export class GitLabFetcher {
  private gitlab: InstanceType<typeof Gitlab>;
  private config: GitLabConfig;
  private logger: Logger;

  constructor(config: GitLabConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.gitlab = new Gitlab({
      token: config.token,
      host: config.url,
    });
  }

  /**
   * 从指定分支获取所有翻译文件
   */
  async fetchFromBranch(
    branch: string,
    basePath: string,
    baseLanguage: string,
    targetLanguage: string,
    mappingFileName?: string
  ): Promise<{
    baseFiles: RemoteFile[];
    targetFiles: RemoteFile[];
    mappingFile?: TranslationMapping;
  }> {
    this.logger.section(`\n📡 从 GitLab 拉取分支: ${branch}`);
    this.logger.verboseLog(`分支: ${branch}`);
    this.logger.verboseLog(`基础语言: ${baseLanguage}`);
    this.logger.verboseLog(`目标语言: ${targetLanguage}`);

    // 获取仓库中的所有文件
    const allFiles = await this.listFiles(branch, basePath);

    this.logger.verboseLog(`找到 ${allFiles.length} 个文件`);

    // 过滤出基础语言和目标语言文件
    const baseFiles: RemoteFile[] = [];
    const targetFiles: RemoteFile[] = [];
    let mappingFile: TranslationMapping | undefined;

    // 如果指定了映射文件名，尝试从根目录获取
    if (mappingFileName) {
      this.logger.verboseLog(`查找映射文件: ${mappingFileName}`);
      try {
        const content = await this.readRawFile(branch, mappingFileName);
        const mapping = yaml.load(content) as TranslationMapping;
        mappingFile = mapping;
        this.logger.verboseLog(`  ✓ 映射文件加载成功 (${mapping.mappings.length} 个映射条目)`);
      } catch (error) {
        this.logger.warn(`  ⚠ 映射文件加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    for (const filePath of allFiles) {
      // 跳过映射文件（已单独处理）
      if (mappingFileName && filePath === mappingFileName) {
        continue;
      }

      // 跳过非 YAML 文件
      if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) {
        continue;
      }

      // 判断文件属于哪种语言
      const language = this.detectLanguage(filePath, baseLanguage, targetLanguage);

      if (!language) {
        this.logger.verboseLog(`跳过文件（无法识别语言）: ${filePath}`);
        continue;
      }

      this.logger.verboseLog(`读取文件: ${filePath} (${language})`);

      try {
        const content = await this.readFile(branch, filePath);
        const file: RemoteFile = {
          path: filePath,
          content,
          language,
        };

        if (language === baseLanguage) {
          baseFiles.push(file);
        } else if (language === targetLanguage) {
          targetFiles.push(file);
        }
      } catch (error) {
        this.logger.error(`读取文件失败: ${filePath}`);
        if (error instanceof Error) {
          this.logger.verboseLog(`  错误: ${error.message}`);
        }
      }
    }

    this.logger.success(`\n读取完成:`);
    this.logger.verboseLog(`  基础语言文件: ${baseFiles.length}`);
    this.logger.verboseLog(`  目标语言文件: ${targetFiles.length}`);
    if (mappingFile) {
      this.logger.verboseLog(`  映射文件: 1`);
    }

    return { baseFiles, targetFiles, mappingFile };
  }

  /**
   * 列出分支上的所有文件
   */
  private async listFiles(branch: string, basePath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      // 使用 GitLab API 列出仓库树
      const repositoryTree = await this.gitlab.Repositories.allRepositoryTrees(
        this.config.projectId,
        {
          ref: branch,
          path: basePath || undefined,
          recursive: true,
        }
      );

      // 提取文件路径
      for (const item of repositoryTree) {
        if (item.type === 'blob') {
          // 保留完整路径，不移除 basePath
          // 这样 readFile 可以直接使用，无需再次拼接 basePath
          files.push(item.path);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }
      throw error;
    }

    return files;
  }

  /**
   * 读取文件内容并解析为对象
   */
  private async readFile(branch: string, filePath: string): Promise<Record<string, string>> {
    try {
      // listFiles 返回的是完整路径（包含 basePath），直接使用
      const file = await this.gitlab.RepositoryFiles.show(
        this.config.projectId,
        filePath,
        branch
      );

      // 解码 base64 内容（需要两次解码）
      let content = Buffer.from(file.content, 'base64').toString('utf-8');
      content = Buffer.from(content, 'base64').toString('utf-8');

      // 解析 YAML
      const parsed = yaml.load(content) as Record<string, string> | undefined;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Invalid YAML content in ${filePath}`);
      }

      return parsed;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 读取文件原始内容（不解析）
   * 自动检测单层或双层 base64 编码
   */
  private async readRawFile(branch: string, filePath: string): Promise<string> {
    try {
      // 使用 GitLab API 读取文件
      const file = await this.gitlab.RepositoryFiles.show(
        this.config.projectId,
        filePath,
        branch
      );

      // 第一次解码
      let content = Buffer.from(file.content, 'base64').toString('utf-8');

      // 检查是否仍然是 base64 编码
      // 如果内容看起来像 base64（只包含 base64 字符且长度足够），则再次解码
      if (/^[A-Za-z0-9+/=]{20,}$/.test(content.trim())) {
        try {
          const decodedAgain = Buffer.from(content, 'base64').toString('utf-8');
          // 如果第二次解码产生了可读的文本（包含换行符、空格等），则使用第二次解码的结果
          if (decodedAgain.includes('\n') || decodedAgain.includes(' ') || decodedAgain.includes(':')) {
            content = decodedAgain;
          }
        } catch {
          // 第二次解码失败，使用第一次解码的结果
        }
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 检测文件属于哪种语言
   */
  private detectLanguage(
    filePath: string,
    baseLanguage: string,
    targetLanguage: string
  ): string | null {
    // 检查路径中是否包含语言代码
    // 使用 normalizePath 确保路径分隔符一致（GitLab 路径使用 /）
    const normalizedPath = filePath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');

    // 查找语言代码
    for (const part of pathParts) {
      if (part === baseLanguage) {
        return baseLanguage;
      }
      if (part === targetLanguage) {
        return targetLanguage;
      }
    }

    return null;
  }

  /**
   * 根据 scanPatterns 从分支中提取 YML 文件目录路径
   * @param branch - 分支名称
   * @param scanPatterns - 扫描模式数组
   * @returns 匹配的目录路径数组（去重，已排序）
   */
  async extractYmlPaths(branch: string, scanPatterns: string[]): Promise<string[]> {
    this.logger.verboseLog(`从分支 ${branch} 提取 YML 路径...`);

    // 获取分支中的所有文件
    const allFiles = await this.listAllFiles(branch);
    this.logger.verboseLog(`分支中共有 ${allFiles.length} 个文件`);

    // 解析 scanPatterns 为正则表达式
    const patterns = scanPatterns.map(pattern => this.patternToRegex(pattern));

    // 匹配文件并提取目录路径
    const dirPaths = new Set<string>();

    for (const filePath of allFiles) {
      // 检查文件是否匹配任何 pattern
      for (const regex of patterns) {
        if (regex.test(filePath)) {
          // 提取目录路径（到文件所在目录，不含文件名）
          const dirPath = path.dirname(filePath);
          dirPaths.add(dirPath);
          this.logger.verboseLog(`  匹配: ${filePath} -> ${dirPath}`);
          break;
        }
      }
    }

    const result = Array.from(dirPaths).sort();
    this.logger.verboseLog(`提取到 ${result.length} 个唯一目录路径`);

    return result;
  }

  /**
   * 列出分支上的所有文件（不受 basePath 限制）
   * 使用 Commits.diff 获取分支最新 commit 的所有文件变更
   */
  private async listAllFiles(branch: string): Promise<string[]> {
    const files: string[] = [];

    try {
      // 首先获取分支的最新 commit
      const branchInfo = await this.gitlab.Branches.show(this.config.projectId, branch);
      const commitId = branchInfo.commit.id;

      this.logger.verboseLog(`分支 ${branch} 最新 commit: ${commitId}`);

      // 获取该 commit 的所有文件 (使用 tree API 获取完整文件树)
      // 由于 @gitbeaker/rest 的 tree API 可能有限制，我们使用原始 REST API
      const url = `${this.config.url}/api/v4/projects/${this.config.projectId}/repository/tree`;
      const params = new URLSearchParams({
        ref: branch,
        recursive: 'true',
        per_page: '100',
      });

      const response = await fetch(`${url}?${params}`, {
        headers: {
          'PRIVATE-TOKEN': this.config.token,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const treeData = (await response.json()) as Array<{ type: string; path: string }>;

      // 提取文件路径
      for (const item of treeData) {
        if (item.type === 'blob') {
          files.push(item.path);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }
      throw error;
    }

    return files;
  }

  /**
   * 将 scanPattern 转换为匹配 GitLab 文件路径的正则表达式
   * 示例: app/(* as app)/config/locales/(* as locale)/*.yml
   * 转换为: ^app/([^/\\]+)/config/locales/([^/\\]+)/[^/\\]+\.yml$
   *
   * 注意：使用 [^/\\]+ 同时匹配 Unix (/) 和 Windows (\) 路径分隔符
   */
  private patternToRegex(pattern: string): RegExp {
    // 按正确顺序处理 pattern
    let regexStr = pattern
      // 1. 首先替换 (* as name) 为占位符，避免被后续处理
      // 匹配变量名时允许 / 和 \ 作为分隔符
      .replace(/\(\*\s+as\s+([^\/\\\s]+)\)/g, '###CAPTURE###')
      // 2. 替换 ** 为多级通配符
      .replace(/\*\*/g, '###DBLSTAR###')
      // 3. 替换 * 为单级通配符
      .replace(/\*/g, '###STAR###')
      // 4. 转义特殊正则表达式字符
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      // 5. 恢复占位符为正确的正则 - 匹配任何非路径分隔符字符
      .replace(/###CAPTURE###/g, '([^/\\\\]+)')
      .replace(/###DBLSTAR###/g, '.*')
      .replace(/###STAR###/g, '[^/\\\\]*');

    return new RegExp('^' + regexStr + '$');
  }
}
