export interface I18nConfig {
  // 基础配置（所有功能共用）
  baseLanguage: string;
  defaultTargets?: string[];
  scanPatterns: string[];

  // 快照功能配置
  snapshot?: {
    dir?: string;
    pathPattern?: string;
  };

  // 翻译复用功能配置
  reuseTranslations?: {
    outputFile?: string;
    ignoreValues?: string[];
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
