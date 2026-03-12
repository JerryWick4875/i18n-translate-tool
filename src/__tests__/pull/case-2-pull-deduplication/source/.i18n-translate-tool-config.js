module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/locales/(* as locale)/*/*.yml'],
  submission: {
    deduplication: {
      mappingFileName: '_translation-mapping.yml',
    },
  },
};
