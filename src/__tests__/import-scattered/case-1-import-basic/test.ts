import * as path from 'path';
import * as fs from 'fs';
import { copyToTemp, cleanupTemp, compareFiles } from '../../utils';
import { ScatteredImporter } from '../../../core/scattered-importer';
import { Logger } from '../../../utils/logger';
import { YamlHandler } from '../../../core/yaml-handler';

export async function run() {
  const testName = 'Import Scattered: Basic Functionality';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');
  const inputFile = path.join(sourceDir, 'translations.txt');

  // Setup: Copy source to temp
  const tempDir = await copyToTemp(sourceDir);

  try {
    const logger = Logger.silent();
    const importer = new ScatteredImporter(logger, tempDir);

    const result = await importer.import({
      inputPath: path.join(tempDir, 'translations.txt'),
      scanPatterns: ['app/(* as app)/locales/(* as locale).yml'],
      baseLanguage: 'zh-CN',
      targetLanguage: 'en-US',
    });

    // 验证结果
    if (result.updatedCount !== 3) {
      console.log(`❌ ${testName} failed: expected updatedCount to be 3, got ${result.updatedCount}`);
      process.exit(1);
    }

    if (result.fileCount !== 1) {
      console.log(`❌ ${testName} failed: expected fileCount to be 1, got ${result.fileCount}`);
      process.exit(1);
    }

    // 读取并验证内容
    const yamlHandler = new YamlHandler();
    const actualFile = path.join(tempDir, 'app/shop/locales/en-US.yml');
    const expectedFile = path.join(expectedDir, 'app/shop/locales/en-US.yml');

    const actualContent = await yamlHandler.loadFile(actualFile);
    const expectedContent = await yamlHandler.loadFile(expectedFile);

    // 比较内容
    const actualKeys = Object.keys(actualContent).sort();
    const expectedKeys = Object.keys(expectedContent).sort();

    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      console.log(`❌ ${testName} failed: keys mismatch`);
      console.log(`  Expected keys: ${expectedKeys.join(', ')}`);
      console.log(`  Actual keys: ${actualKeys.join(', ')}`);
      process.exit(1);
    }

    for (const key of expectedKeys) {
      if (actualContent[key] !== expectedContent[key]) {
        console.log(`❌ ${testName} failed: value mismatch for key "${key}"`);
        console.log(`  Expected: "${expectedContent[key]}"`);
        console.log(`  Actual: "${actualContent[key]}"`);
        process.exit(1);
      }
    }

    console.log(`✅ ${testName} passed`);
  } finally {
    await cleanupTemp(tempDir);
  }
}

