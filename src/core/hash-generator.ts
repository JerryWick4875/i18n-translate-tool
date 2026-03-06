import * as crypto from 'crypto';

/**
 * Hash Generator
 * 生成稳定的哈希 ID 用于去重
 */
export class HashGenerator {
  /**
   * 生成 SHA-256 哈希值（16 字符）
   */
  static generate(value: string): string {
    const hash = crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * 生成带前缀的哈希值
   */
  static withPrefix(value: string, prefix?: string): string {
    const hash = this.generate(value);
    return prefix ? `${prefix}_${hash}` : hash;
  }
}
