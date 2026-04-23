import { BirthdayCommands } from './birthday.command';
import { CoinsCommand } from './coins';
import { PruneCommand } from './prune.command';
import { RenameCommands } from './rename.command';
import { TopCommand } from './top.command';
import { UserCommands } from './user.command';

export const commands = [
  UserCommands,
  BirthdayCommands,
  RenameCommands,
  TopCommand,
  CoinsCommand,
  PruneCommand,
];
