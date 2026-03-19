#!/usr/bin/env node

import { program } from 'commander';
import * as snapshot from './commands/snapshot';
import * as sync from './commands/sync';
import * as reuseTranslations from './commands/reuse-translations';
import * as submitGitlab from './commands/submit-gitlab';
import * as pull from './commands/pull';
import * as submitXanadu from './commands/submit-xanadu';
import * as autoSubmit from './commands/auto-submit';

program
  .name('i18n-translate-tool')
  .description('i18n 翻译同步和快照工具')
  .version('1.0.0');

// 注册命令
program.addCommand(snapshot.command);
program.addCommand(sync.command);
program.addCommand(reuseTranslations.command);
program.addCommand(submitGitlab.command);
program.addCommand(pull.command);
program.addCommand(submitXanadu.command);
program.addCommand(autoSubmit.command);

program.parse();
