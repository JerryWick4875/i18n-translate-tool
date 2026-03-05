import { loadConfig } from '../../../config/config-loader';
import { DEFAULT_CONFIG } from '../../../config/defaults';

export async function run() {
  const testName = 'Config Loading';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;

  // Test with default config (no custom config)
  const result = await loadConfig(testDir);

  // Should use defaults since no config file exists
  if (
    result.scanPatterns.length === DEFAULT_CONFIG.scanPatterns.length &&
    result.snapshotDir === DEFAULT_CONFIG.snapshotDir &&
    result.baseLanguage === DEFAULT_CONFIG.baseLanguage
  ) {
    console.log(`✅ ${testName} passed`);
  } else {
    console.log(`❌ ${testName} failed`);
    process.exit(1);
  }
}
