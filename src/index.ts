#!/usr/bin/env node

import { program } from 'commander';
import * as snapshot from './commands/snapshot';
import * as sync from './commands/sync';
import * as reuseTranslations from './commands/reuse-translations';
import * as submit from './commands/submit';
import * as pull from './commands/pull';

program
  .name('i18n-translate-tool')
  .description('i18n 翻译同步和快照工具')
  .version('1.0.0');

// 注册命令
program.addCommand(snapshot.command);
program.addCommand(sync.command);
program.addCommand(reuseTranslations.command);
program.addCommand(submit.command);
program.addCommand(pull.command);

program.parse();
