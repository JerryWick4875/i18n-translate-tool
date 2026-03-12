module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/locales/(* as locale)/*/*.yml'],
  submission: {
    outputDir: 'i18n-translate-submission',
    deduplication: {
      enabled: true,
      mappingFileName: '_translation-mapping.yml',
    },
  },
};
