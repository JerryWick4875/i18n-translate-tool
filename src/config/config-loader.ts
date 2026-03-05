import * as fs from 'fs/promises';
import * as path from 'path';
import { I18nConfig } from '../types';
import { DEFAULT_CONFIG } from './defaults';
import { I18nConfigSchema } from './config-schema';

/**
 * 配置文件名
 */
const CONFIG_FILE_NAME = '.i18n-translate-tool-config.js';

/**
 * 从项目目录加载配置
 * 在指定目录或父目录中搜索配置文件
 */
export async function loadConfig(cwd: string): Promise<I18nConfig> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    return DEFAULT_CONFIG;
  }

  try {
    const userConfig = await importUserConfig(configPath);
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
    defaultTargets: userConfig.defaultTargets ?? defaults.defaultTargets,
    scanPatterns: userConfig.scanPatterns || defaults.scanPatterns,

    // 快照配置
    snapshot: {
      dir: userConfig.snapshot?.dir || defaults.snapshot?.dir,
      pathPattern: userConfig.snapshot?.pathPattern || defaults.snapshot?.pathPattern,
    },

    // 翻译复用配置
    reuseTranslations: {
      outputFile: userConfig.reuseTranslations?.outputFile || defaults.reuseTranslations?.outputFile,
      ignoreValues: userConfig.reuseTranslations?.ignoreValues ?? defaults.reuseTranslations?.ignoreValues,
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
