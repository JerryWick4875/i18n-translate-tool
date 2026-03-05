import { z } from 'zod';

/**
 * 配置校验 Schema
 */
export const I18nConfigSchema = z.object({
  scanPatterns: z.array(z.string()).min(1),
  snapshotDir: z.string().min(1),
  snapshotPathPattern: z.string().optional(),
  baseLanguage: z.string().min(1),
  defaultTargets: z.array(z.string().min(1)).optional(),
});

export type I18nConfigInput = z.infer<typeof I18nConfigSchema>;
