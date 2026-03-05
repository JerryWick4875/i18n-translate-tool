import { z } from 'zod';

/**
 * 快照配置 Schema
 */
const SnapshotConfigSchema = z.object({
  dir: z.string().min(1).optional(),
  pathPattern: z.string().optional(),
}).strict();

/**
 * 翻译复用配置 Schema
 */
const ReuseTranslationsConfigSchema = z.object({
  outputFile: z.string().optional(),
  ignoreValues: z.array(z.string()).optional(),
}).strict();

/**
 * 配置校验 Schema
 */
export const I18nConfigSchema = z.object({
  // 基础配置
  baseLanguage: z.string().min(1),
  defaultTargets: z.array(z.string().min(1)).optional(),
  scanPatterns: z.array(z.string()).min(1),

  // 功能配置
  snapshot: SnapshotConfigSchema.optional(),
  reuseTranslations: ReuseTranslationsConfigSchema.optional(),
}).strict();

export type I18nConfigInput = z.infer<typeof I18nConfigSchema>;

/**
 * 验证配置
 */
export function validateConfig(rawConfig: any): any {
  return I18nConfigSchema.parse(rawConfig);
}
