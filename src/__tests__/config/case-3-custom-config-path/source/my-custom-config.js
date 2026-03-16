module.exports = {
  baseLanguage: 'zh-CN',
  defaultTargets: ['fr-FR', 'de-DE'],
  scanPatterns: [
    'custom/(* as module)/locales/(* as locale)/*.yml',
  ],
  snapshot: {
    dir: 'custom-snapshot-dir',
    pathPattern: '{module}/{locale}.yml',
  },
  reuse: {
    outputFile: '.custom-reuse.yml',
    ignoreValues: ['CUSTOM_IGNORE'],
  },
};
