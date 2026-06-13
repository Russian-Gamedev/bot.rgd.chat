import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

import { ActorType, Permission } from './permissions.types';

export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';
export const REQUIRED_ACTOR_TYPES_KEY = 'required_actor_types';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireActorTypes = (...actorTypes: ActorType[]) =>
  SetMetadata(REQUIRED_ACTOR_TYPES_KEY, actorTypes);

export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.actor;
  },
);
