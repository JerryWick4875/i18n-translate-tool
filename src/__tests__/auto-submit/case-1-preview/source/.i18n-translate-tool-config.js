module.exports = {
  baseLanguage: 'zh-CN',
  defaultTarget: 'en-US',
  scanPatterns: [
    'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
  ],
  snapshot: {
    dir: '.i18n-translate-tool-snapshot',
    pathPattern: '{app}/{product}/{locale}.yml',
  },
  reuse: {
    outputFile: '.i18n-translate-tool-reuse.yml',
  },
  submission: {
    outputDir: '.i18n-translate-tool-submission',
    gitlab: {
      url: 'http://localhost',
      projectId: 1,
      token: 'test-token',
    },
    xanadu: {
      url: 'http://localhost',
    },
  },
};
