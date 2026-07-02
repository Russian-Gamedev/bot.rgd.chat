import { CommandsCommand } from './utils/commands.command';
import { EditCommand } from './utils/edit.command';
import { PingCommand } from './utils/ping.command';
import { PruneCommand } from './utils/prune.command';
import { UserUtilsCommand } from './utils/user.command';

export const commands = [
  CommandsCommand,
  PingCommand,
  UserUtilsCommand,
  PruneCommand,
  EditCommand,
];
