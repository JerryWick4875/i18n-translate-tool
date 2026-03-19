import { I18nConfig } from '../types';

/**
 * 默认配置值
 */
export const DEFAULT_CONFIG: I18nConfig = {
  // 基础配置
  baseLanguage: 'zh-CN',
  defaultTarget: 'en-US',
  scanPatterns: [
    'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
  ],

  // 输出格式配置
  outputFormat: {
    quotingType: '"',
    forceQuotes: true,
    indent: 2,
  },

  // 快照配置
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{product}/{target}.yml',
  },

  // 翻译复用配置
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
    ignoreValues: ['(i18n-no-translate)', '-', 'TODO'],
  },

  // 提交配置
  submission: {
    outputDir: 'i18n-translate-submission',
    gitlab: {
      url: 'https://gitlab.example.com',
      projectId: 0, // GitLab 项目 ID（数字）
      token: process.env.GITLAB_TOKEN || '',
      basePath: '',
      legacyUrlFormat: false, // 默认使用新版 GitLab URL 格式
    },
    xanadu: {
      url: 'http://i18n.sangfor.com',
      taskType: 'Front-End',
      sourceLang: 'zh-CN',
      targetLang: 'en-US',
      personnel: {
        prDockerId: 0,
        translationDockerId: 0,
        commitDockerId: 0,
        managerId: 0,
        feDockerId: 0,
      },
      project: {
        productId: 0, // 产品 ID，创建项目时使用
        level: 'normal',
        versionType: 'oversea',
      },
    },
  },
};
