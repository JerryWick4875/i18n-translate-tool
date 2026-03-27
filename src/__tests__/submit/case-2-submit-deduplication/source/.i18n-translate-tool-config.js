module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/locales/(* as locale)/*/*.yml'],
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{locale}.yml',
  },
  submission: {
    outputDir: 'i18n-translate-submission',
    deduplication: {
      enabled: true,
      mappingFileName: '_translation-mapping.yml',
    },
  },
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
  },
};
