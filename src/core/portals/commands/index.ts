import { BlacklistCommand } from './blacklist.command';
import { CreatePortalCommand } from './create.command';
import { DeletePortalCommand } from './delete.command';
import { ListPortalsCommand } from './list.command';

export const commands = [
  CreatePortalCommand,
  DeletePortalCommand,
  ListPortalsCommand,
  BlacklistCommand,
];
