module.exports = {
  baseLanguage: 'zh-CN',
  defaultTarget: 'en-US',
  scanPatterns: [
    'app/(* as app)/locales/(* as locale)/entries/*.yml',
  ],
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
  },
};
