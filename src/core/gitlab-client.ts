import { Gitlab } from '@gitbeaker/rest';
import { Logger } from '../utils/logger';
import { GitLabConfig, FileCommit } from '../types';
import { normalizePath } from '../utils/file-utils';

/**
 * GitLab 客户端
 */
export class GitLabClient {
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
   * 创建新分支
   */
  async createBranch(branchName: string, ref: string = 'main'): Promise<void> {
    this.logger.verboseLog(`创建分支: ${branchName} (from ${ref})`);

    try {
      await this.gitlab.Branches.create(this.config.projectId, branchName, ref);
      this.logger.success(`分支创建成功: ${branchName}`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create branch: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 提交单个文件到仓库
   */
  async commitFile(
    filePath: string,
    content: string,
    branchName: string,
    commitMessage: string = 'chore: 提交待翻译结构'
  ): Promise<void> {
    this.logger.verboseLog(`提交文件: ${filePath}`);

    try {
      // GitLab API 会自动处理路径编码，不需要手动编码

      await this.gitlab.RepositoryFiles.create(
        this.config.projectId,
        filePath,
        branchName,
        content,
        commitMessage
      );

      this.logger.verboseLog(`  ✓ ${filePath}`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to commit file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 提交多个文件到仓库（单个 commit）
   */
  async commitFiles(
    files: FileCommit[],
    branchName: string,
    commitMessage: string = 'chore: 提交待翻译结构'
  ): Promise<number> {
    this.logger.section(`\n📤 提交 ${files.length} 个文件到 GitLab...`);

    try {
      // 构建 actions 数组，用于批量提交
      const actions = files.map((file) => ({
        action: 'create' as const,
        filePath: file.path,
        content: file.content,
      }));

      // 使用单个 commit 提交所有文件
      await this.gitlab.Commits.create(
        this.config.projectId,
        branchName,
        commitMessage,
        actions
      );

      this.logger.success(`\n✅ 成功提交 ${files.length} 个文件（单个 commit）`);
      return files.length;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`\n✗ 提交失败: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 检查项目访问权限
   */
  async checkAccess(): Promise<boolean> {
    try {
      await this.gitlab.Projects.show(this.config.projectId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 生成查看分支的 URL
   * 通过 projectId 获取项目路径后生成
   */
  async getBranchUrl(branchName: string): Promise<string> {
    // 获取项目信息
    const project = await this.gitlab.Projects.show(this.config.projectId);
    const projectPath = project.path_with_namespace;

    const separator = this.config.legacyUrlFormat ? '' : '/-';
    return `${this.config.url}/${projectPath}${separator}/tree/${branchName}`;
  }

  /**
   * 生成分支名称
   */
  static generateBranchName(): string {
    const now = new Date();
    const datetime =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    return `translations-${datetime}`;
  }

  /**
   * 读取本地文件内容
   */
  static async readFileContent(filePath: string): Promise<string> {
    const { readFile } = await import('fs/promises');
    return await readFile(filePath, 'utf-8');
  }

  /**
   * 准备提交的文件列表
   */
  static async prepareFiles(
    outputDir: string,
    basePath?: string,
    mappingFileName?: string
  ): Promise<{ files: FileCommit[]; mappingFile?: FileCommit }> {
    const { glob } = await import('glob');
    const { join, relative } = await import('path');

    const pattern = join(outputDir, '**/*.yml');
    const files = await glob(pattern, { absolute: true });

    const commits: FileCommit[] = [];
    let mappingFileCommit: FileCommit | undefined;

    for (const file of files) {
      const content = await this.readFileContent(file);
      let relativePath = relative(outputDir, file);

      // 规范化路径为正斜杠（跨平台兼容）
      relativePath = normalizePath(relativePath);

      // 检查是否是映射文件
      const fileName = relativePath.split('/').pop();
      if (mappingFileName && fileName === mappingFileName) {
        // 映射文件放在仓库根目录
        mappingFileCommit = {
          path: mappingFileName,
          content,
        };
        continue;
      }

      // 去掉第一层的语言目录（如 zh-CN, en-US, zh, en 等）
      const pathParts = relativePath.split('/');
      if (pathParts.length > 0) {
        const firstPart = pathParts[0];
        // 语言代码格式：2个字母，可选后跟 - 和更多字母/数字
        // 如: zh, en, zh-CN, en-US, zh-Hans, pt-BR
        const langCodePattern = /^[a-zA-Z]{2}(-[a-zA-Z0-9-]+)?$/;
        if (langCodePattern.test(firstPart)) {
          relativePath = pathParts.slice(1).join('/');
        }
      }

      // 如果指定了 basePath，将其添加到文件路径
      if (basePath) {
        relativePath = normalizePath(join(basePath, relativePath));
      }

      commits.push({
        path: relativePath,
        content,
      });
    }

    return { files: commits, mappingFile: mappingFileCommit };
  }
}
