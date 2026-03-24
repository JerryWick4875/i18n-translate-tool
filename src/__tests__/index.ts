import * as path from 'path';

// Test cases organized by command group
const TEST_GROUPS = {
  config: [
    'case-1-config-loading',
    'case-2-invalid-config',
    'case-3-custom-config-path',
  ],
  snapshot: [
    'case-1-snapshot-basic',
  ],
  sync: [
    'case-1-sync-new-keys',
    'case-2-sync-changed-keys',
    'case-3-sync-deleted-keys',
    'case-4-mixed-changes',
    'case-5-multiple-files',
    'case-6-product-structure',
    'case-7-filter-directory',
    'case-8-missing-variable',
    'case-9-auto-create-target-file',
  ],
  reuse: [
    'case-1-unique-match',
    'case-2-multiple-matches',
    'case-3-apply-translations',
    'case-4-ignore-values',
    'case-5-one-time-mode',
    'case-6-custom-output',
  ],
  submit: [
    'case-2-submit-deduplication',
    'case-3-submit-no-deduplication',
  ],
  pull: [
    'case-1-pull-basic',
    'case-2-pull-deduplication',
    'case-3-pull-primary-key-empty',
  ],
  'export-scattered': [
    'case-1-export-basic',
    'case-2-locale-in-directory',
    'case-3-root-locale-file',
  ],
  'import-scattered': [
    'case-1-import-basic',
  ],
};

export async function runAllTests() {
  console.log('🚀 Running i18n Tool Tests...\n');

  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  // Run tests by group
  for (const [groupName, testCases] of Object.entries(TEST_GROUPS)) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${groupName.toUpperCase()} TESTS`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (const testCase of testCases) {
      results.total++;
      const testPath = path.join(__dirname, groupName, testCase, 'test.ts');

      try {
        const { run } = await import(testPath);
        await run();
        results.passed++;
      } catch (error) {
        if (error instanceof Error) {
          console.error(`❌ ${testCase} failed:`, error.message);
        }
        results.failed++;
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 OVERALL RESULTS: ${results.passed}/${results.total} passed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
