import { program } from 'commander';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import { ScatteredImporter } from '../core/scattered-importer';
import * as fs from 'fs';

export const command = program
  .command('import-scattered')
  .description('导入零散翻译文件：读取翻译后的文件，将目标语言内容填回对应的 key')
  .requiredOption('-i, --input <path>', '输入文件路径')
  .option('-t, --target <lang>', '目标语言代码')
  .option('--dry-run', '预览模式，不实际修改文件')
  .option('-c, --config <path>', '配置文件路径')
  .option('-v, --verbose', '详细输出')
  .action(async (options) => {
    const logger = new Logger(options.verbose);
    try {
      logger.info('📥 导入零散翻译文件\n');

      // 检查输入文件是否存在
      if (!fs.existsSync(options.input)) {
        logger.error(`❌ 错误: 找不到输入文件 ${options.input}`);
        process.exit(1);
      }

      // 加载配置
      const cwd = process.cwd();
      const config = await loadConfig(cwd, options.config);

      // 确定目标语言
      const targetLanguage = options.target || config.defaultTarget;
      if (!targetLanguage) {
        logger.error('❌ 错误: 请指定目标语言（使用 --target 或在配置中设置 defaultTarget）');
        process.exit(1);
      }

      // 创建导入器并执行
      const importer = new ScatteredImporter(logger, cwd);
      const result = await importer.import({
        inputPath: options.input,
        scanPatterns: config.scanPatterns,
        baseLanguage: config.baseLanguage,
        targetLanguage,
        dryRun: options.dryRun,
      });

      logger.info(`\n✅ 导入完成:`);
      logger.info(`  更新文件: ${result.fileCount}`);
      logger.info(`  更新 key: ${result.updatedCount}`);

      if (options.dryRun) {
        logger.warn(`\n⚠ 这是预览模式，没有实际修改文件`);
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`\n❌ 错误: ${error.message}`);
      } else {
        logger.error(`\n❌ 未知错误`);
      }
      process.exit(1);
    }
  });
