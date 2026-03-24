import { Command } from 'commander';
import { SyncEngine } from '../core/sync-engine';
import { ReuseEngine } from '../core/reuse-engine';
import { ScatteredExporter } from '../core/scattered-exporter';
import { loadConfig } from '../config/config-loader';
import { Logger } from '../utils/logger';
import * as path from 'path';

/**
 * 自动导出零散翻译命令选项
 */
interface AutoExportScatteredOptions {
  target?: string;
  filter?: string | string[];
  output?: string;
  config?: string;
  verbose?: boolean;
}

export const command = new Command('auto-export-scattered')
  .description('自动执行：同步 -> 复用 -> 导出零散翻译')
  .option('--target <language>', '目标语言代码（默认使用配置文件中的 defaultTarget）')
  .option('--filter <paths...>', '过滤到特定目录（可多个，例如: app/shop 或 app/shop app/admin）')
  .option('-o, --output <path>', '输出文件路径', '.scattered-translations.txt')
  .option('--config <path>', '配置文件路径', '.i18n-translate-tool-config.js')
  .option('--verbose', '启用详细输出', false)
  .action(async (options: AutoExportScatteredOptions) => {
    const logger = new Logger(options.verbose || false, false);

    try {
      logger.section('\n🚀 auto-export-scattered');

      // 解析配置文件路径
      const configPath = path.resolve(options.config || '.i18n-translate-tool-config.js');
      const configDir = path.dirname(configPath);

      // 加载配置
      logger.info('加载配置...');
      const config = await loadConfig(configDir, configPath);
      const basePath = configDir;

      // 确定目标语言
      const target = options.target || config.defaultTarget || 'en-US';
      logger.info(`目标语言: ${target}`);

      // 前置验证
      logger.section('\n🔍 验证配置...');
      validateConfig(config);
      logger.success('配置验证通过');

      // 步骤1: Sync
      logger.section('\n📋 步骤 1/3: 同步翻译...');
      await runSync(config, basePath, target, options.filter, logger);
      logger.success('同步完成');

      // 步骤2: Reuse（只复用唯一值）
      logger.section('\n📋 步骤 2/3: 复用翻译...');
      const reuseResult = await runReuse(config, basePath, target, options.filter, logger);
      if (reuseResult.filledCount > 0) {
        logger.success(`复用完成，填充了 ${reuseResult.filledCount} 个翻译`);
      } else {
        logger.info('没有可复用的唯一匹配翻译');
      }

      // 步骤3: 导出零散翻译
      logger.section('\n📋 步骤 3/3: 导出零散翻译...');
      const exportResult = await runExportScattered(config, basePath, target, options.filter, options.output, logger);
      logger.success(`导出完成: ${exportResult.filePath}`);
      logger.info(`  总 key 数: ${exportResult.totalCount}`);
      logger.info(`  唯一词条: ${exportResult.uniqueCount}`);

      // 完成
      logger.section('\n✅ 全部流程执行完成');
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\n❌ 错误: ${error.message}`);
      }
      process.exit(1);
    }
  });

/**
 * 验证配置
 */
function validateConfig(config: any): void {
  const errors: string[] = [];

  // 验证基础配置
  if (!config.baseLanguage) {
    errors.push('baseLanguage 未配置');
  }
  if (!config.scanPatterns || config.scanPatterns.length === 0) {
    errors.push('scanPatterns 未配置或为空');
  }
  if (!config.defaultTarget) {
    errors.push('defaultTarget 未配置（用于确定目标语言）');
  }

  // 验证 snapshot 配置
  if (!config.snapshot?.dir) {
    errors.push('snapshot.dir 未配置');
  }
  if (!config.snapshot?.pathPattern) {
    errors.push('snapshot.pathPattern 未配置');
  }

  if (errors.length > 0) {
    throw new Error('配置验证失败:\n' + errors.map(e => `  - ${e}`).join('\n'));
  }
}

/**
 * 执行 Sync
 */
async function runSync(
  config: any,
  basePath: string,
  target: string,
  filter: string | string[] | undefined,
  logger: Logger
): Promise<void> {
  const syncEngine = new SyncEngine(
    {
      target,
      basePath,
      filter,
      verbose: logger.isVerbose(),
      dryRun: false,
    },
    config.snapshot?.pathPattern || '{app}/{locale}.yml',
    logger
  );

  const snapshotDir = path.join(basePath, config.snapshot?.dir || 'i18n-translate-snapshot');

  const result = await syncEngine.sync(
    config.scanPatterns,
    snapshotDir,
    config.baseLanguage
  );

  if (result.fileCount > 0) {
    logger.summary(result.addedCount, result.changedCount, result.deletedCount);
  }
}

/**
 * 执行 Reuse（只复用唯一值）
 */
async function runReuse(
  config: any,
  basePath: string,
  target: string,
  filter: string | string[] | undefined,
  logger: Logger
): Promise<{ filledCount: number; multipleMatchesCount: number }> {
  const reuseEngine = new ReuseEngine(
    {
      target,
      basePath,
      baseLanguage: config.baseLanguage,
      filter,
      verbose: logger.isVerbose(),
      dryRun: false,
    },
    logger
  );

  // 使用 generateAndApply 方法，只应用唯一匹配
  const result = await reuseEngine.generateAndApply(
    config.scanPatterns,
    config.baseLanguage,
    false
  );

  return {
    filledCount: result.filledCount,
    multipleMatchesCount: result.multipleMatchesCount,
  };
}

/**
 * 执行导出零散翻译
 */
async function runExportScattered(
  config: any,
  basePath: string,
  target: string,
  filter: string | string[] | undefined,
  outputPath: string | undefined,
  logger: Logger
): Promise<{ filePath: string; totalCount: number; uniqueCount: number }> {
  // 应用过滤
  let scanPatterns = config.scanPatterns;
  if (filter && filter.length > 0) {
    // 支持多个 filter，每个 filter 都应用到所有 scanPattern 上
    const filteredPatterns: string[] = [];
    for (const f of Array.isArray(filter) ? filter : [filter]) {
      for (const pattern of scanPatterns) {
        // 将第一个命名通配符替换为 filter
        const filtered = pattern.replace(/\(\*\s+as\s+[^)]+\)/, f);
        filteredPatterns.push(filtered);
      }
    }
    scanPatterns = filteredPatterns;
  }

  // 创建导出器并执行
  const exporter = new ScatteredExporter(logger, basePath);
  const result = await exporter.export({
    scanPatterns,
    baseLanguage: config.baseLanguage,
    targetLanguage: target,
    outputPath: outputPath || '.scattered-translations.txt',
  });

  return {
    filePath: result.filePath,
    totalCount: result.totalCount,
    uniqueCount: result.uniqueCount,
  };
}
