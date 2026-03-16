module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/config/locales/(* as locale)/*.yml'],
  snapshot: {
    dir: 'i18n-translate-snapshot',
  },
  reuse: {
    outputFile: '.i18ntool-reuse.yml',
    ignoreValues: ['(i18n-no-translate)', '-', 'TODO'],
  },
};
