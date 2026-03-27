module.exports = {
  baseLanguage: 'zh-CN',
  scanPatterns: ['app/(* as app)/config/products/(* as product)/locales/(* as locale)/*/*.yml'],
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{product}/{locale}.yml',
  },
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
  },
};
