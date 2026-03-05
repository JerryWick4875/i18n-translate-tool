import * as path from 'path';
import { loadConfig } from '../../../config/config-loader';

export async function run() {
  const testName = 'Invalid Config';
  console.log(`\n🧪 Test: ${testName}`);

  const testDir = __dirname;
  const sourceDir = path.join(testDir, 'source');

  try {
    // 尝试加载无效配置，应该抛出错误
    await loadConfig(sourceDir);

    // 如果没有抛出错误，测试失败
    console.log(`❌ ${testName} failed: Expected error for invalid config`);
    process.exit(1);
  } catch (error) {
    if (error instanceof Error) {
      // 验证错误消息格式
      if (error.message.includes('Config validation failed') && error.message.includes('scanPatterns')) {
        console.log(`✅ ${testName} passed`);
        console.log(`  Error message:\n  ${error.message.split('\n')[1]}`);
      } else {
        console.log(`❌ ${testName} failed: Unexpected error message`);
        console.log(`  Error: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log(`❌ ${testName} failed: Unexpected error type`);
      process.exit(1);
    }
  }
}
