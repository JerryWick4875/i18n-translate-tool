import * as path from 'path';
import { glob } from 'glob';
import { LocaleFile } from '../types';

/**
 * 使用 glob 模式过滤文件列表
 * 取 scanPatterns 扫描结果与 filterPatterns glob 结果的交集
 *
 * @param files - 已扫描的文件列表
 * @param filterPatterns - glob 过滤模式数组
 * @param basePath - 基础路径
 * @returns 过滤后的文件列表
 */
export async function filterFilesByGlob(
  files: LocaleFile[],
  filterPatterns: string[],
  basePath: string
): Promise<LocaleFile[]> {
  if (filterPatterns.length === 0) {
    return files;
  }

  // 收集所有 filter glob 匹配的文件路径
  const filterPaths = new Set<string>();
  for (const filterPattern of filterPatterns) {
    const absolutePattern = path.isAbsolute(filterPattern)
      ? filterPattern
      : path.join(basePath, filterPattern);
    const matches = await glob(absolutePattern, { absolute: true, nodir: true });
    matches.forEach(m => filterPaths.add(m));
  }

  // 只保留在 filter 结果中的文件
  return files.filter(f => filterPaths.has(f.path));
}
