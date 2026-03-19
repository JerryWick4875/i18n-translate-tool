/**
 * 格式化控制台输出的日志工具
 */
export class Logger {
  private verbose: boolean;
  private silent: boolean;

  constructor(verbose: boolean = false, silent: boolean = false) {
    this.verbose = verbose;
    this.silent = silent;
  }

  /**
   * 记录信息消息
   */
  info(message: string): void {
    if (!this.silent) {
      console.log(message);
    }
  }

  /**
   * 记录详细消息（仅详细模式）
   */
  verboseLog(message: string): void {
    if (this.verbose && !this.silent) {
      console.log(`  ${message}`);
    }
  }

  /**
   * 记录带对勾的成功消息
   */
  success(message: string): void {
    if (!this.silent) {
      console.log(`✅ ${message}`);
    }
  }

  /**
   * 记录警告消息
   */
  warn(message: string): void {
    if (!this.silent) {
      console.warn(`⚠️  ${message}`);
    }
  }

  /**
   * 记录错误消息
   */
  error(message: string): void {
    if (!this.silent) {
      console.error(`❌ ${message}`);
    }
  }

  /**
   * 记录新增的键
   */
  logNewKey(key: string, filePath: string): void {
    if (!this.silent) {
      console.log(`  [新增] ${key} → ${filePath}`);
    }
  }

  /**
   * 记录更改的键
   */
  logChangedKey(key: string, oldValue: string, newValue: string, filePath: string): void {
    if (!this.silent) {
      console.log(`  [变更] ${key}: "${oldValue}" → "${newValue}" (已清空 ${filePath} 对应文案)`);
    }
  }

  /**
   * 记录删除的键
   */
  logDeletedKey(key: string, filePath: string): void {
    if (!this.silent) {
      console.log(`  [删除] ${key} → ${filePath}`);
    }
  }

  /**
   * 记录试运行指示器
   */
  dryRun(message: string): void {
    if (!this.silent) {
      console.log(`🔍 [DRY RUN] ${message}`);
    }
  }

  /**
   * 记录章节标题
   */
  section(title: string): void {
    if (!this.silent) {
      console.log(`\n${title}`);
    }
  }

  /**
   * 记录摘要
   */
  summary(added: number, changed: number, deleted: number): void {
    if (!this.silent) {
      console.log(`\n摘要: ${added} 个新增, ${changed} 个变更, ${deleted} 个删除`);
    }
  }

  /**
   * 创建静默日志记录器（用于测试）
   */
  static silent(): Logger {
    return new Logger(false, true);
  }

  /**
   * 检查是否为详细模式
   */
  isVerbose(): boolean {
    return this.verbose;
  }
}
