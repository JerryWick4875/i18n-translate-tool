import { Gitlab } from '@gitbeaker/rest';
import { Logger } from '../utils/logger';
import { GitLabConfig, RemoteFile, TranslationMapping } from '../types';
import * as yaml from 'js-yaml';

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
        this.config.project,
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
        this.config.project,
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
        this.config.project,
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
    const pathParts = filePath.split('/');

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
}
