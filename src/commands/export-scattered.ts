import { program } from 'commander';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import { ScatteredExporter } from '../core/scattered-exporter';

export const command = program
  .command('export-scattered')
  .description('导出零散翻译文件：提取需要翻译的 key，生成包含 keys 和基础语言内容的文件')
  .option('-o, --output <path>', '输出文件路径', '.scattered-translations.txt')
  .option('-t, --target <lang>', '目标语言代码')
  .option('--filter <patterns...>', '过滤特定目录（可多个）')
  .option('-c, --config <path>', '配置文件路径')
  .option('-v, --verbose', '详细输出')
  .action(async (options) => {
    const logger = new Logger(options.verbose);
    try {
      logger.info('📤 导出零散翻译文件\n');

      // 加载配置
      const cwd = process.cwd();
      const config = await loadConfig(cwd, options.config);

      // 确定目标语言
      const targetLanguage = options.target || config.defaultTarget;
      if (!targetLanguage) {
        logger.error('❌ 错误: 请指定目标语言（使用 --target 或在配置中设置 defaultTarget）');
        process.exit(1);
      }

      // 创建导出器并执行
      const exporter = new ScatteredExporter(logger, cwd);
      const result = await exporter.export({
        scanPatterns: config.scanPatterns,
        baseLanguage: config.baseLanguage,
        targetLanguage,
        outputPath: options.output || config.scattered?.outputFile,
        filterPatterns: options.filter,
      });

      logger.info(`\n✅ 导出完成:`);
      logger.info(`  总 key 数: ${result.totalCount}`);
      logger.info(`  唯一词条: ${result.uniqueCount}`);
      logger.info(`  📄 文件路径: ${result.filePath}`);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`\n❌ 错误: ${error.message}`);
      } else {
        logger.error(`\n❌ 未知错误`);
      }
      process.exit(1);
    }
  });
