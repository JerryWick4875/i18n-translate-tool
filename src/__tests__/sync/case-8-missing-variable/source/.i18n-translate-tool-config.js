module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/locales/(* as locale)/*.yml'],
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{product}/{target}.yml',
  },
};
