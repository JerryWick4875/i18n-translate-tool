import * as path from 'path';
import { copyToTemp, compareDirs, cleanupTemp } from '../../utils';
import { ReuseEngine } from '../../../core/reuse-engine';
import { Logger } from '../../../utils/logger';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Reuse Translations - Case 3: Apply Translations';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');
  const expectedDir = path.join(testDir, 'expected');

  const tempDir = await copyToTemp(sourceDir);

  try {
    const config = await loadConfig(tempDir);
    const logger = Logger.silent();

    // 读取建议文件并应用
    const reuseEngine = new ReuseEngine({
      target: 'en-US',
      basePath: tempDir,
      inputPath: path.join(tempDir, '.i18n-translate-tool-reuse.yml'),
      verbose: false,
    }, logger);

    const suggestionsData = await reuseEngine.readSuggestionsFile(
      path.join(tempDir, '.i18n-translate-tool-reuse.yml')
    );

    await reuseEngine.applyTranslations(suggestionsData, false);

    // 验证结果
    const result = await compareDirs(
      path.join(tempDir, 'app'),
      path.join(expectedDir, 'app')
    );

    if (result) {
      console.log(`✅ ${testName} passed`);
    } else {
      console.log(`❌ ${testName} failed`);
      process.exit(1);
    }
  } finally {
    await cleanupTemp(tempDir);
  }
}
