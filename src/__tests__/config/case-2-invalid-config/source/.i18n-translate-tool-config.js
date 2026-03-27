module.exports = {
  scanPatterns: [],  // 错误：空数组
  snapshotDir: 'i18n-translate-snapshot',
  baseLanguage: 'zh-CN',
  snapshot: {
    dir: 'i18n-translate-snapshot',
    pathPattern: '{app}/{locale}.yml',
  },
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
  },
};
