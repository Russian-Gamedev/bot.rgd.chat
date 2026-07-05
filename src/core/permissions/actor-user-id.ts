import { BadRequestException } from '@nestjs/common';

import { ActorType, type AuthenticatedActor } from './permissions.types';

export function getActorUserId(actor: AuthenticatedActor): string {
  if (actor.type === ActorType.User) return actor.id;
  if (actor.bot.botUserId) return actor.bot.botUserId.toString();

  throw new BadRequestException(
    'Bot token is not linked to a Discord profile.',
  );
}
