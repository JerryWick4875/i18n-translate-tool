import { z } from 'zod';

/**
 * 输出格式配置 Schema
 */
const OutputFormatConfigSchema = z.object({
  quotingType: z.literal("'").or(z.literal('"')).optional(),
  forceQuotes: z.boolean().optional(),
  indent: z.number().int().positive().optional(),
}).strict();

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
 * 去重配置 Schema
 */
const DeduplicationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  mappingFileName: z.string().min(1).optional(),
}).strict();

/**
 * 提交配置 Schema
 */
const SubmissionConfigSchema = z.object({
  outputDir: z.string().min(1).optional(),
  deduplication: DeduplicationConfigSchema.optional(),
  gitlab: z.object({
    url: z.string().url(),
    project: z.string().min(1),
    token: z.string(),
    basePath: z.string().optional(),
  }).optional(),
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
  outputFormat: OutputFormatConfigSchema.optional(),
  snapshot: SnapshotConfigSchema.optional(),
  reuseTranslations: ReuseTranslationsConfigSchema.optional(),
  submission: SubmissionConfigSchema.optional(),
}).strict();

export type I18nConfigInput = z.infer<typeof I18nConfigSchema>;

/**
 * 验证配置
 */
export function validateConfig(rawConfig: any): any {
  return I18nConfigSchema.parse(rawConfig);
}
