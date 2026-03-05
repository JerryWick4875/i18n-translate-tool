#!/usr/bin/env node

import { program } from 'commander';
import * as snapshot from './commands/snapshot';
import * as sync from './commands/sync';

program
  .name('i18n-tool')
  .description('i18n 翻译同步和快照工具')
  .version('1.0.0');

// 注册命令
program.addCommand(snapshot.command);
program.addCommand(sync.command);

program.parse();
