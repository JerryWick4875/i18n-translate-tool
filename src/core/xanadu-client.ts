import { Logger } from '../utils/logger';
import { XanaduConfig, GitLabConfig } from '../types';

/**
 * 创建项目响应
 */
export interface CreateProjectResponse {
  code: number;
  msg: string;
  data: string; // 产品名称
}

/**
 * 项目信息
 */
export interface ProjectInfo {
  id: number;
  name: string;
  product_name: string;
  gitlab_project_id?: string;
  transfer_time: number;
}

/**
 * 创建任务响应
 */
export interface CreateTaskResponse {
  code: number;
  msg: string;
  data?: unknown;
}

/**
 * 创建项目选项
 */
export interface CreateProjectOptions {
  gitlabProjectId: number;
  gitlabDomain: string;
  sourceLang: string;
  targetLang: string;
  productId?: number;
  projectName: string; // 项目名称，用于 Xanadu 创建项目
  level?: 'normal' | 'high' | 'low';
  versionType?: 'oversea' | 'domestic';
  managerId?: number;
  translationDockerId?: number;
  feDockerId?: number;
}

/**
 * 创建任务选项
 */
export interface CreateTaskOptions {
  projectId: number;
  gitlabProjectId: number;
  gitlabDomain: string;
  branchName: string;
  ymlPath: string;
  taskType: string;
  sourceLang: string;
  targetLang: string;
  prDockerId?: number;
  translationDockerId?: number;
  commitDockerId?: number;
}

/**
 * Xanadu API 客户端
 */
export class XanaduClient {
  private config: XanaduConfig;
  private gitlabConfig: GitLabConfig;
  private cookie: string;
  private logger: Logger;

  constructor(
    config: XanaduConfig,
    gitlabConfig: GitLabConfig,
    cookie: string,
    logger: Logger
  ) {
    this.config = config;
    this.gitlabConfig = gitlabConfig;
    this.cookie = cookie;
    this.logger = logger;
  }

  /**
   * 获取请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Cookie': this.cookie,
    };
  }

  /**
   * 验证 Token 有效性
   */
  async checkAuth(): Promise<boolean> {
    try {
      // 通过查询项目列表来验证 Token
      const response = await fetch(`${this.config.url}/api/project/list`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          limit: 1,
          page: 1,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 查找项目 ID
   * 根据项目名称、产品名、GitLab 项目 ID 和 transfer_time 精确匹配
   */
  async findProjectId(
    gitlabProjectId: number,
    projectName: string,
    productName: string,
    transferTime: number,
    sourceLang: string,
    targetLang: string
  ): Promise<number | null> {
    try {
      // 使用项目名称作为搜索关键词
      const response = await fetch(`${this.config.url}/api/project/list`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          limit: 100,
          page: 1,
          search: projectName,
          source_lang: sourceLang,
          translation_lang: targetLang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const result = await response.json() as {
        code: number;
        msg: string;
        data?: { list?: ProjectInfo[] };
      };
      if (result.code !== 0) {
        throw new Error(`API error: ${result.msg}`);
      }

      // 精确匹配：产品名、GitLab 项目 ID、transfer_time
      const projects: ProjectInfo[] = result.data?.list || [];
      const project = projects.find(
        (p) =>
          p.product_name === productName &&
          p.gitlab_project_id === String(gitlabProjectId) &&
          p.transfer_time === transferTime
      );

      return project?.id || null;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to find project: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 创建项目
   */
  async createProject(options: CreateProjectOptions): Promise<number> {
    this.logger.section('\n🏗️ 创建 Xanadu 项目...');

    const now = Date.now();
    const requestBody = {
      id: 0,
      gitlab_domain: options.gitlabDomain,
      product_id: options.productId || 0,
      product_version: options.projectName,
      gitlab_project_id: String(options.gitlabProjectId),
      remark_info: '',
      level: options.level || this.config.project?.level || 'normal',
      version_type: options.versionType || this.config.project?.versionType || 'oversea',
      start_time: now,
      transfer_time: now,
      publish_time: now,
      manager: options.managerId || this.config.personnel?.managerId || 0,
      translation_docker: options.translationDockerId || this.config.personnel?.translationDockerId || 0,
      fe_docker: options.feDockerId || this.config.personnel?.feDockerId || 0,
      source_lang: options.sourceLang,
      translation_lang: options.targetLang,
      zh_device_address: '',
      en_device_address: '',
      design_draft_address: '',
    };

    try {
      const response = await fetch(`${this.config.url}/api/project/add`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as CreateProjectResponse;
      if (result.code !== 0) {
        throw new Error(`API error: ${result.msg}`);
      }

      this.logger.success(`项目创建成功: ${result.data}`);

      // 创建项目后需要查询获取项目 ID
      // 使用产品名、GitLab 项目 ID 和 transfer_time 精确匹配
      const productName = result.data;
      const projectId = await this.findProjectId(
        options.gitlabProjectId,
        options.projectName,
        productName,
        now,
        options.sourceLang,
        options.targetLang
      );
      if (!projectId) {
        throw new Error('项目创建成功但无法获取项目 ID，请稍后重试');
      }

      this.logger.info(`项目 ID: ${projectId}`);
      return projectId;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create project: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 创建翻译任务
   */
  async createTask(options: CreateTaskOptions): Promise<CreateTaskResponse> {
    this.logger.section('\n📝 创建 Xanadu 翻译任务...');

    const now = Date.now();
    const requestBody = {
      id: 0,
      type: options.taskType,
      source_lang: options.sourceLang,
      translation_lang: options.targetLang,
      file_id: 0,
      gitlab_domain: options.gitlabDomain,
      gitlab_project_id: options.gitlabProjectId,
      gitlab_project_branch: options.branchName,
      gitlab_project_yml_path: options.ymlPath,
      gitlab_project_yml_config_file: '',
      pr_docker_id: options.prDockerId || this.config.personnel?.prDockerId || 0,
      zh_label: options.sourceLang,
      en_label: options.targetLang,
      translation_docker_id: options.translationDockerId || this.config.personnel?.translationDockerId || 0,
      hope_delivery_time: now,
      expected_delivery_time: now,
      really_delivery_time: now,
      word_count: 0,
      remark_info: '',
      is_drop: 0,
      commit_docker_id: options.commitDockerId || this.config.personnel?.commitDockerId || 0,
      project_id: options.projectId,
    };

    this.logger.verboseLog(`请求参数:`);
    this.logger.verboseLog(`  - 项目 ID: ${options.projectId}`);
    this.logger.verboseLog(`  - 分支: ${options.branchName}`);
    this.logger.verboseLog(`  - YML 路径: ${options.ymlPath}`);
    this.logger.verboseLog(`  - 源语言: ${options.sourceLang}`);
    this.logger.verboseLog(`  - 目标语言: ${options.targetLang}`);

    try {
      const response = await fetch(`${this.config.url}/api/task`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as CreateTaskResponse;
      if (result.code !== 0) {
        throw new Error(`API error: ${result.msg}`);
      }

      this.logger.success('翻译任务创建成功');
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create task: ${error.message}`);
      }
      throw error;
    }
  }
}
