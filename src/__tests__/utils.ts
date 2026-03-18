import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface TestCase {
  name: string;
  setup(): Promise<void>;
  run(): Promise<void>;
  verify(): Promise<boolean>;
  cleanup(): Promise<void>;
}

/**
 * Copy source directory to temp directory
 */
export async function copyToTemp(sourceDir: string): Promise<string> {
  // Use os.tmpdir() for cross-platform temp directory
  const tempDir = path.join(os.tmpdir(), `i18n-test-${Date.now()}`);
  // Convert sourceDir to absolute path
  const absoluteSourceDir = path.resolve(sourceDir);

  // Use fs.cp for cross-platform directory copying (Node.js 16+)
  await fs.cp(absoluteSourceDir, tempDir, { recursive: true });
  return tempDir;
}

/**
 * Compare file contents
 */
export async function compareFiles(
  actualPath: string,
  expectedPath: string
): Promise<boolean> {
  try {
    const [actual, expected] = await Promise.all([
      fs.readFile(actualPath, 'utf-8'),
      fs.readFile(expectedPath, 'utf-8')
    ]);
    return actual === expected;
  } catch (error) {
    return false;
  }
}

/**
 * Compare directories recursively
 */
export async function compareDirs(
  actualDir: string,
  expectedDir: string
): Promise<boolean> {
  try {
    const [actualEntries, expectedEntries] = await Promise.all([
      fs.readdir(actualDir, { withFileTypes: true }),
      fs.readdir(expectedDir, { withFileTypes: true })
    ]);

    // Build maps of entry names
    const actualMap = new Map(
      actualEntries.map(e => [e.name, e])
    );
    const expectedMap = new Map(
      expectedEntries.map(e => [e.name, e])
    );

    // Check all expected entries exist in actual
    for (const [name, expectedEntry] of expectedMap) {
      const actualEntry = actualMap.get(name);

      if (!actualEntry) {
        console.error(`Missing entry: ${name}`);
        return false;
      }

      const actualPath = path.join(actualDir, name);
      const expectedPath = path.join(expectedDir, name);

      if (expectedEntry.isDirectory() && actualEntry.isDirectory()) {
        const subResult = await compareDirs(actualPath, expectedPath);
        if (!subResult) {
          return false;
        }
      } else if (expectedEntry.isFile() && actualEntry.isFile()) {
        const fileResult = await compareFiles(actualPath, expectedPath);
        if (!fileResult) {
          console.error(`File mismatch: ${name}`);
          return false;
        }
      } else {
        console.error(`Type mismatch for: ${name}`);
        return false;
      }
    }

    // Check for extra files in actual
    for (const [name] of actualMap) {
      if (!expectedMap.has(name)) {
        console.error(`Extra entry in actual: ${name}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error comparing directories:', error);
    return false;
  }
}

/**
 * Cleanup temp directory
 */
export async function cleanupTemp(tempDir: string): Promise<void> {
  // Use fs.rm for cross-platform directory removal (Node.js 14.14+)
  await fs.rm(tempDir, { recursive: true, force: true });
}

/**
 * Write file content
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read file content
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
