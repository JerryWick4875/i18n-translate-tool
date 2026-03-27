module.exports = {
  baseLanguage: 'zh-CN',
  defaultTarget: 'en-US',
  scanPatterns: [
    '(* as locale).yml',
  ],
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
  },
};
