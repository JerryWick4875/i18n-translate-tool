import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 基于扫描模式从文件路径中提取应用名称
 * 假设应用名称是模式中第一个通配符，如 app-STAR-config
 */
export function extractAppName(filePath: string, patterns: string[]): string {
  for (const pattern of patterns) {
    const parts = pattern.split('*');
    if (parts.length >= 2) {
      const before = parts[0];
      const beforeIndex = filePath.indexOf(before);
      if (beforeIndex !== -1) {
        const afterPath = filePath.substring(beforeIndex + before.length);
        const slashIndex = afterPath.indexOf('/');
        if (slashIndex !== -1) {
          return afterPath.substring(0, slashIndex);
        }
      }
    }
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  const appMatch = normalizedPath.match(/\/app\/([^/]+)\//);
  if (appMatch) {
    return appMatch[1];
  }

  return path.basename(path.dirname(filePath));
}

/**
 * 从文件名中提取语言代码
 */
export function extractLanguage(fileName: string): string {
  const name = path.basename(fileName, path.extname(fileName));
  return name;
}

/**
 * 获取从基础路径开始的相对路径
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  return path.relative(basePath, fullPath);
}

/**
 * 确保目录存在，如果不存在则创建
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * 将路径分隔符标准化为正斜杠
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
