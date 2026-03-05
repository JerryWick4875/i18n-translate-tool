module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/config/locales/(* as locale)/*/*.yml'],
  snapshot: {
    dir: 'i18n-translate-snapshot',
  },
};
