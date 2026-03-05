import { Gitlab } from '@gitbeaker/rest';
import { Logger } from '../utils/logger';
import { GitLabConfig, FileCommit } from '../types';

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
      await this.gitlab.Branches.create(this.config.project, branchName, ref);
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
        this.config.project,
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
   * 提交多个文件到仓库
   */
  async commitFiles(
    files: FileCommit[],
    branchName: string,
    commitMessage: string = 'chore: 提交待翻译结构'
  ): Promise<number> {
    this.logger.section(`\n📤 提交 ${files.length} 个文件到 GitLab...`);

    let successCount = 0;
    let failCount = 0;

    // 串行提交文件，避免并发冲突
    for (const file of files) {
      try {
        await this.commitFile(file.path, file.content, branchName, commitMessage);
        successCount++;
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`  ✗ ${file.path}: ${error.message}`);
        }
        failCount++;
      }
    }

    if (failCount > 0) {
      this.logger.warn(`\n⚠️  提交完成: ${successCount} 成功, ${failCount} 失败`);
    } else {
      this.logger.success(`\n✅ 成功提交 ${successCount} 个文件`);
    }

    return successCount;
  }

  /**
   * 检查项目访问权限
   */
  async checkAccess(): Promise<boolean> {
    try {
      await this.gitlab.Projects.show(this.config.project);
      return true;
    } catch {
      return false;
    }
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
  static async prepareFiles(outputDir: string, basePath?: string): Promise<FileCommit[]> {
    const { glob } = await import('glob');
    const { join, relative } = await import('path');

    const pattern = join(outputDir, '**/*.yml');
    const files = await glob(pattern, { absolute: true });

    const commits: FileCommit[] = [];
    for (const file of files) {
      const content = await this.readFileContent(file);
      let relativePath = relative(outputDir, file);

      // 去掉第一层的语言目录（zh-CN 或 en-US）
      const pathParts = relativePath.split('/');
      if (pathParts.length > 0) {
        relativePath = pathParts.slice(1).join('/');
      }

      // 如果指定了 basePath，将其添加到文件路径
      if (basePath) {
        relativePath = join(basePath, relativePath);
      }

      // 标准化路径分隔符
      relativePath = relativePath.replace(/\\/g, '/');

      commits.push({
        path: relativePath,
        content,
      });
    }

    return commits;
  }
}
