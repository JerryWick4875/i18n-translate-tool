import * as path from 'path';
import * as fs from 'fs';
import { ScatteredExporter } from '../../../core/scattered-exporter';
import { Logger } from '../../../utils/logger';

export async function run() {
  const testName = 'Export Scattered: Filter by glob pattern';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');
  const outputFile = path.join(testDir, '.scattered-translations.txt');
  const expectedFile = path.join(expectedDir, '.scattered-translations.txt');

  // 清理之前的输出
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  try {
    const logger = Logger.silent();
    const exporter = new ScatteredExporter(logger, sourceDir);

    // 使用 filter 只处理 shop 目录
    const result = await exporter.export({
      scanPatterns: ['app/(* as app)/locales/(* as locale).yml'],
      baseLanguage: 'zh-CN',
      targetLanguage: 'en-US',
      outputPath: outputFile,
      filterPatterns: ['app/shop/**/*.yml'],
    });

    // 验证结果 - 应该只有 shop 的 2 个 key（shopDesc 和 shopPrice，shopTitle 已翻译）
    if (result.totalCount !== 2) {
      console.log(`❌ ${testName} failed: expected totalCount to be 2, got ${result.totalCount}`);
      console.log(`   shop has 2 untranslated keys, widget should be filtered out`);
      process.exit(1);
    }

    if (result.uniqueCount !== 2) {
      console.log(`❌ ${testName} failed: expected uniqueCount to be 2, got ${result.uniqueCount}`);
      process.exit(1);
    }

    // 验证输出文件存在
    if (!fs.existsSync(outputFile)) {
      console.log(`❌ ${testName} failed: output file not created`);
      process.exit(1);
    }

    // 比较输出文件和预期文件
    const actualContent = fs.readFileSync(outputFile, 'utf-8');
    const expectedContent = fs.readFileSync(expectedFile, 'utf-8');

    if (actualContent !== expectedContent) {
      console.log(`❌ ${testName} failed: output content does not match expected`);
      console.log(`\nActual:\n${actualContent}`);
      console.log(`\nExpected:\n${expectedContent}`);
      process.exit(1);
    }

    console.log(`✅ ${testName} passed`);
  } finally {
    // 清理输出文件
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
  }
}
