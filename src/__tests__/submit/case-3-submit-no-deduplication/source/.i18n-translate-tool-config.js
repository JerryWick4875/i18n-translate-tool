module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/locales/(* as locale)/*/*.yml'],
  submission: {
    outputDir: 'i18n-translate-submission',
    deduplication: {
      enabled: false,  // 禁用去重
      mappingFileName: '_translation-mapping.yml',
    },
  },
};
