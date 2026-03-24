module.exports = {
  baseLanguage: 'zh-CN',
  defaultTarget: 'en-US',
  scanPatterns: ['app/(* as app)/locales/(* as locale).yml'],
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{locale}.yml',
  },
};
