import * as fs from 'fs/promises';
import * as path from 'path';
import { I18nConfig, XanaduConfig } from '../types';
import { DEFAULT_CONFIG } from './defaults';
import { I18nConfigSchema } from './config-schema';

/**
 * 配置文件名
 */
const CONFIG_FILE_NAME = '.i18n-translate-tool-config.js';

/**
 * 从项目目录加载配置
 * 在指定目录或父目录中搜索配置文件
 * @param cwd - 起始目录
 * @param configPath - 可选的配置文件路径，如果提供则直接使用
 */
export async function loadConfig(cwd: string, configPath?: string): Promise<I18nConfig> {
  const finalConfigPath = configPath ? path.resolve(cwd, configPath) : await findConfigFile(cwd);

  if (!finalConfigPath) {
    return DEFAULT_CONFIG;
  }

  // 使用最终的配置路径
  const configDir = path.dirname(finalConfigPath);

  try {
    const userConfig = await importUserConfig(finalConfigPath);
    const merged = mergeConfig(DEFAULT_CONFIG, userConfig);
    validateConfig(merged);
    return merged;
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a ZodError
      if ('issues' in error && Array.isArray(error.issues)) {
        const zodError = error as { issues: Array<{ path: string[]; message: string }> };
        const errorMessages = zodError.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`
        ).join('\n');
        throw new Error(`Config validation failed:\n${errorMessages}`);
      }
      throw new Error(`Failed to load config from ${finalConfigPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 从指定路径加载配置（旧版本兼容）
 * @deprecated 使用 loadConfig(cwd, configPath) 替代
 */
export async function loadConfigFromPath(configPath: string): Promise<I18nConfig> {
  try {
    // 清除 require 缓存以允许重新加载
    delete require.cache[require.resolve(configPath)];
    const mod = await import(configPath);
    const userConfig = mod.default || mod;
    const merged = mergeConfig(DEFAULT_CONFIG, userConfig);
    validateConfig(merged);
    return merged;
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a ZodError
      if ('issues' in error && Array.isArray((error as { issues?: unknown }).issues)) {
        const zodError = error as { issues: Array<{ path: string[]; message: string }> };
        const errorMessages = zodError.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`
        ).join('\n');
        throw new Error(`Config validation failed:\n${errorMessages}`);
      }
      throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 通过向上搜索目录树查找配置文件
 */
async function findConfigFile(startDir: string): Promise<string | null> {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    const configPath = path.join(currentDir, CONFIG_FILE_NAME);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // 继续搜索父目录
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;

    // 在 git 根目录停止
    const gitDir = path.join(currentDir, '.git');
    try {
      await fs.access(gitDir);
      break;
    } catch {
      // 没有 .git 目录，继续
    }
  }

  return null;
}

/**
 * 从 JS 文件导入用户配置
 */
async function importUserConfig(configPath: string): Promise<Partial<I18nConfig>> {
  // 清除 require 缓存以允许重新加载
  delete require.cache[require.resolve(configPath)];
  const module = await import(configPath);
  return module.default || module;
}

/**
 * 合并用户配置和默认配置（用户配置优先）
 */
function mergeConfig(
  defaults: I18nConfig,
  userConfig: Partial<I18nConfig>
): I18nConfig {
  return {
    // 基础配置
    baseLanguage: userConfig.baseLanguage || defaults.baseLanguage,
    defaultTarget: userConfig.defaultTarget ?? defaults.defaultTarget,
    scanPatterns: userConfig.scanPatterns || defaults.scanPatterns,

    // 输出格式配置
    outputFormat: {
      quotingType: userConfig.outputFormat?.quotingType || defaults.outputFormat?.quotingType,
      forceQuotes: userConfig.outputFormat?.forceQuotes ?? defaults.outputFormat?.forceQuotes,
      indent: userConfig.outputFormat?.indent || defaults.outputFormat?.indent,
    },

    // 快照配置
    snapshot: {
      dir: userConfig.snapshot?.dir || defaults.snapshot?.dir,
      pathPattern: userConfig.snapshot?.pathPattern || defaults.snapshot?.pathPattern,
    },

    // 翻译复用配置
    reuse: {
      outputFile: userConfig.reuse?.outputFile || defaults.reuse?.outputFile,
      ignoreValues: userConfig.reuse?.ignoreValues ?? defaults.reuse?.ignoreValues,
    },

    // 提交配置
    submission: {
      outputDir: userConfig.submission?.outputDir || defaults.submission?.outputDir,
      gitlab: userConfig.submission?.gitlab || defaults.submission?.gitlab,
      deduplication: userConfig.submission?.deduplication || defaults.submission?.deduplication,
      xanadu: mergeXanaduConfig(defaults.submission?.xanadu, userConfig.submission?.xanadu),
    },
  };
}

/**
 * 合并 Xanadu 配置
 */
function mergeXanaduConfig(
  defaults?: XanaduConfig,
  userConfig?: Partial<XanaduConfig>
): XanaduConfig | undefined {
  if (!userConfig) {
    return defaults;
  }

  return {
    url: userConfig.url || defaults?.url || 'https://i18n.sangfor.org',
    taskType: userConfig.taskType || defaults?.taskType || 'Front-End',
    sourceLang: userConfig.sourceLang || defaults?.sourceLang || 'zh-CN',
    targetLang: userConfig.targetLang || defaults?.targetLang || 'en-US',
    personnel: {
      prDockerId: userConfig.personnel?.prDockerId ?? defaults?.personnel?.prDockerId ?? 0,
      translationDockerId:
        userConfig.personnel?.translationDockerId ?? defaults?.personnel?.translationDockerId ?? 0,
      commitDockerId: userConfig.personnel?.commitDockerId ?? defaults?.personnel?.commitDockerId ?? 0,
      managerId: userConfig.personnel?.managerId ?? defaults?.personnel?.managerId ?? 0,
      feDockerId: userConfig.personnel?.feDockerId ?? defaults?.personnel?.feDockerId ?? 0,
    },
    project: {
      productId: userConfig.project?.productId ?? defaults?.project?.productId ?? 0,
      level: userConfig.project?.level || defaults?.project?.level || 'normal',
      versionType: userConfig.project?.versionType || defaults?.project?.versionType || 'oversea',
    },
  };
}

/**
 * 使用 zod 验证配置值
 */
function validateConfig(config: I18nConfig): void {
  I18nConfigSchema.parse(config);
}

/**
 * 获取 snapshot 目录的绝对路径
 */
export function getSnapshotDir(config: I18nConfig, basePath: string): string {
  const snapshotDir = config.snapshot?.dir || 'i18n-translate-snapshot';
  return path.resolve(basePath, snapshotDir);
}
