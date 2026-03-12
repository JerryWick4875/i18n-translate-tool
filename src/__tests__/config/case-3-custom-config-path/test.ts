import * as path from 'path';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Custom Config Path';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const customConfigPath = path.join(testDir, 'source', 'my-custom-config.js');

  // Test loading config from custom path
  const result = await loadConfig(testDir, customConfigPath);

  // Verify custom config values are loaded
  const checks = [
    { name: 'baseLanguage', expected: 'zh-CN', actual: result.baseLanguage },
    { name: 'defaultTargets[0]', expected: 'fr-FR', actual: result.defaultTargets?.[0] },
    { name: 'defaultTargets[1]', expected: 'de-DE', actual: result.defaultTargets?.[1] },
    { name: 'scanPatterns[0]', expected: 'custom/(* as module)/locales/(* as locale)/*.yml', actual: result.scanPatterns?.[0] },
    { name: 'snapshot.dir', expected: 'custom-snapshot-dir', actual: result.snapshot?.dir },
    { name: 'snapshot.pathPattern', expected: '{module}/{locale}.yml', actual: result.snapshot?.pathPattern },
    { name: 'reuseTranslations.outputFile', expected: '.custom-reuse.yml', actual: result.reuseTranslations?.outputFile },
    { name: 'reuseTranslations.ignoreValues[0]', expected: 'CUSTOM_IGNORE', actual: result.reuseTranslations?.ignoreValues?.[0] },
  ];

  let allPassed = true;
  for (const check of checks) {
    if (check.actual !== check.expected) {
      console.log(`❌ ${check.name}: expected "${check.expected}", got "${check.actual}"`);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(`✅ ${testName} passed`);
  } else {
    console.log(`❌ ${testName} failed`);
    process.exit(1);
  }
}
