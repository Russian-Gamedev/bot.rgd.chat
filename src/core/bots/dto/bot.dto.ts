import { Permission } from '#core/permissions/permissions.types';

export class BotDto {
  id: number;

  name: string;

  ownerId: string;

  botUserId: string | null;

  permissions: Permission[];

  lastUsedAt?: Date;
}
