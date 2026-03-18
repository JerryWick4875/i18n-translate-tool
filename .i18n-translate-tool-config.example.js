// i18n-translate-tool 配置文件示例
// 将此文件重命名为 .i18n-translate-tool-config.js 并放在项目根目录

module.exports = {
  // ==================== 基础配置（所有功能共用）====================
  // 基础/源语言代码
  baseLanguage: 'zh-CN',

  // 默认目标语言列表（用于快照功能）
  defaultTargets: ['en-US', 'ja-JP'],

  // 扫描模式 - 支持通配符和变量捕获
  // 必须包含 (* as locale) 来指定语言代码位置
  scanPatterns: [
    // 示例：单层结构（语言代码直接在 locales/ 下）
    // 'app/(* as app)/config/locales/(* as locale)/*.yml',

    // 示例：嵌套结构（语言代码后有子目录）
    'app/(* as app)/config/locales/(* as locale)/*/*.yml',

    // 示例：多变量（app + product + locale）
    // 'app/(* as app)/config/products/(* as product)/locales/(* as locale)/*.yml',
  ],

  // ==================== 快照功能配置 ====================
  snapshot: {
    // 快照文件存储目录（相对于项目根目录）
    dir: 'i18n-translate-snapshot',

    // 快照文件路径模式
    // 可用变量: {app}, {product}, {target}, {language} 等
    pathPattern: '{app}/{product}/{target}.yml',
  },

  // ==================== 翻译复用功能配置 ====================
  reuse: {
    // 翻译复用建议文件输出路径（相对于项目根目录）
    outputFile: '.i18n-translate-tool-reuse.yml',

    // 忽略值列表（这些值会被视为"空值"并需要填充翻译）
    ignoreValues: [
      '(i18n-no-translate)',
      '-',
      'TODO',
      'N/A',
      '待翻译'
    ],
  },

  // ==================== 提交功能配置（可选）====================
  // submission: {
  //   // 提取文件输出目录（相对于项目根目录）
  //   outputDir: 'i18n-translate-submission',
  //
  //   // 去重功能配置
  //   deduplication: {
  //     enabled: false,                    // 是否启用去重
  //     mappingFileName: '_translation-mapping.yml', // 映射文件名
  //   },
  //
  //   // GitLab 配置（用于 --apply 提交到 GitLab）
  //   gitlab: {
  //     url: 'https://gitlab.example.com', // GitLab 地址
  //     projectId: 123,                    // 项目 ID
  //     token: process.env.GITLAB_TOKEN || '', // 访问令牌
  //     basePath: '',                      // 文件在仓库中的基础路径（可选）
  //     baseBranch: 'main',                // 创建分支的基线分支（可选，默认 main）
  //   },
  //
  //   // Xanadu 配置（用于提交到翻译平台）
  //   xanadu: {
  //     sourceLang: 'zh',                  // 源语言代码
  //     targetLang: 'en',                  // 目标语言代码
  //     personnel: {                       // 人员配置（Docker ID）
  //       prDockerId: 123,                 // PR 人员 ID
  //       translationDockerId: 456,        // 翻译人员 ID
  //       commitDockerId: 789,             // 提交人员 ID
  //       managerId: 101,                  // 管理员 ID
  //       feDockerId: 102,                 // 前端人员 ID
  //     },
  //     project: {                         // 项目配置
  //       level: 'normal',                 // 优先级: normal | high | low
  //       versionType: 'oversea',          // 版本类型: oversea | domestic
  //     },
  //   },
  // },
};
