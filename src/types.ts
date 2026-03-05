export interface I18nConfig {
  scanPatterns: string[];
  snapshotDir: string;
  snapshotPathPattern?: string;
  baseLanguage: string;
  defaultTargets?: string[];
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
