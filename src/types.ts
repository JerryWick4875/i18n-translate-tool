export interface I18nConfig {
  // 基础配置（所有功能共用）
  baseLanguage: string;
  defaultTarget?: string;
  scanPatterns: string[];

  // 输出格式配置（所有功能共用）
  outputFormat?: {
    quotingType?: string;
    forceQuotes?: boolean;
    indent?: number;
  };

  // 快照功能配置
  snapshot?: {
    dir?: string;
    pathPattern?: string;
  };

  // 翻译复用功能配置
  reuse?: {
    outputFile?: string;
    ignoreValues?: string[];
  };

  // 提交功能配置
  submission?: {
    outputDir?: string;
    deduplication?: {
      enabled?: boolean;
      mappingFileName?: string;
    };
    gitlab?: GitLabConfig;
    xanadu?: XanaduConfig; // Xanadu 翻译平台配置
  };
}

export interface LocaleFile {
  path: string;
  app: string;
  language: string;
  relativePath: string;
  variables?: Record<string, string>;
  content: Record<string, string>;
}

export interface LocaleGroup {
  app: string;
  languages: Record<string, LocaleFile[]>;
}

export interface SnapshotData {
  [filePath: string]: Record<string, string>;
}

export interface DiffResult {
  added: Map<string, string>;
  changed: Map<string, { old: string; new: string }>;
  deleted: Set<string>;
}

export interface SyncOptions {
  target: string;
  basePath: string;
  filter?: string;
  verbose?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export interface SnapshotOptions {
  target: string;
  app?: string;
  basePath: string;
  verbose?: boolean;
}

export interface SyncResult {
  addedCount: number;
  changedCount: number;
  deletedCount: number;
  fileCount: number;
  appCount: number;
}

/**
 * 翻译复用建议项
 */
export interface ReuseSuggestion {
  file: string;
  key: string;
  baseValue: string;
  value?: string;
  suggestions?: ReuseSuggestionSource[];
}

/**
 * 翻译来源信息
 */
export interface ReuseSuggestionSource {
  value: string;
  source: string;
  sourceKey: string;
}

/**
 * 翻译复用建议文件数据结构
 */
export interface ReuseSuggestionsData {
  generatedAt: string;
  locale: string;
  items: ReuseSuggestion[];
}

/**
 * 翻译复用选项
 */
export interface ReuseTranslationOptions {
  target: string;
  basePath: string;
  baseLanguage?: string;
  filter?: string;
  outputPath?: string;
  inputPath?: string;
  apply?: boolean;
  verbose?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * 翻译复用结果
 */
export interface ReuseTranslationResult {
  filledCount: number;
  skippedCount: number;
  multipleMatchesCount: number;
  fileCount: number;
}

/**
 * 键位置信息
 */
export interface KeyLocation {
  file: string;
  key: string;
}

/**
 * 翻译映射文件结构
 */
export interface TranslationMapping {
  version: string;
  generatedAt: string;
  mappings: MappingEntry[];
}

/**
 * 单个映射条目
 */
export interface MappingEntry {
  uniqueId: string;
  baseValue: string;
  primaryKey: KeyLocation;
  otherKeys: KeyLocation[];
}

/**
 * 去重条目（提交阶段）
 */
export interface DedupedEntry {
  uniqueId: string;
  baseValue: string;
  primaryKey: KeyLocation;
  otherKeys: KeyLocation[];
}

/**
 * 提交选项
 */
export interface SubmissionOptions {
  target: string;
  basePath: string;
  filter?: string;
  force?: boolean;
  apply?: boolean;
  verbose?: boolean;
  deduplication?: boolean;
}

/**
 * 提取结果
 */
export interface ExtractionResult {
  fileCount: number;
  entryCount: number;
  files: ExtractedFile[];
}

/**
 * 提取的文件
 */
export interface ExtractedFile {
  relativePath: string;
  baseLanguage: string;
  targetLanguage: string;
  entryCount: number;
}

/**
 * GitLab 配置
 */
export interface GitLabConfig {
  url: string;
  projectId: number; // GitLab 项目 ID（数字）
  token: string;
  basePath?: string;
  baseBranch?: string; // 创建分支的基线分支，默认为 'main'
  legacyUrlFormat?: boolean; // 是否使用老版本 GitLab URL 格式（无 '-' 分隔符）
}

/**
 * Xanadu 人员配置
 */
export interface XanaduPersonnelConfig {
  prDockerId?: number; // 默认: 0
  translationDockerId?: number; // 默认: 0
  commitDockerId?: number; // 默认: 0
  managerId?: number; // 默认: 0（创建项目时用）
  feDockerId?: number; // 默认: 0（创建项目时用）
}

/**
 * Xanadu 项目配置
 * 注：productVersion 作为项目名称，通过 --create-xanadu-project-name 参数传入
 */
export interface XanaduProjectConfig {
  productId?: number; // 产品 ID，创建项目时使用
  level?: 'normal' | 'high' | 'low'; // 优先级，默认 normal
  versionType?: 'oversea' | 'domestic'; // 版本类型，默认 oversea
}

/**
 * Xanadu 配置
 */
export interface XanaduConfig {
  url: string; // 默认: http://i18n.sangfor.com
  taskType?: string; // 默认: "Front-End"
  sourceLang?: string; // 默认: "zh-CN"
  targetLang?: string; // 默认: "en-US"
  personnel?: XanaduPersonnelConfig;
  project?: XanaduProjectConfig;
}

/**
 * 文件提交信息
 */
export interface FileCommit {
  path: string;
  content: string;
}

/**
 * 提交结果
 */
export interface SubmissionResult {
  extracted: ExtractionResult;
  branchName?: string;
  commitCount?: number;
}

/**
 * 拉取选项
 */
export interface PullOptions {
  branch: string;
  target: string;
  basePath: string;
  filter?: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

/**
 * 拉取结果
 */
export interface PullResult {
  filledCount: number;
  skippedCount: number;
  fileCount: number;
  skippedEntries: SkippedEntry[];
}

/**
 * 跳过的词条
 */
export interface SkippedEntry {
  filePath: string;
  key: string;
  reason: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * 远程文件
 */
export interface RemoteFile {
  path: string;
  content: Record<string, string>;
  language: string;
}
