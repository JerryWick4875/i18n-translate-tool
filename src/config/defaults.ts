import { I18nConfig } from '../types';

/**
 * 默认配置值
 */
export const DEFAULT_CONFIG: I18nConfig = {
  // 基础配置
  baseLanguage: 'zh-CN',
  defaultTargets: ['en-US', 'ja-JP'],
  scanPatterns: [
    'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
  ],

  // 快照配置
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{product}/{target}.yml',
  },

  // 翻译复用配置
  reuseTranslations: {
    outputFile: '.i18n-translate-tool-reuse.yml',
    ignoreValues: ['(i18n-no-translate)', '-', 'TODO'],
  },
};
