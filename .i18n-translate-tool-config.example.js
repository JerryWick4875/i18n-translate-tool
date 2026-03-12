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
  reuseTranslations: {
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
};
