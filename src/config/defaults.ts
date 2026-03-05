import { I18nConfig } from '../types';

/**
 * 默认配置值
 */
export const DEFAULT_CONFIG: I18nConfig = {
  scanPatterns: [
    'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
  ],
  snapshotDir: '.i18n-snapshot',
  snapshotPathPattern: '{app}/{product}/{target}.yml',
  baseLanguage: 'zh-CN',
  defaultTargets: ['en-US', 'ja-JP'],
};
