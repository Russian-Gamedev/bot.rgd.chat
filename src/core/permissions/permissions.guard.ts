import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { type EnvironmentVariables } from '#config/env';
import { getAuthCookieToken } from '#core/auth/auth-cookie';
import {
  REQUIRED_ACTOR_TYPES_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './permissions.decorator';
import { PermissionService } from './permissions.service';
import type {
  AuthenticatedActor,
  PermissionContext,
} from './permissions.types';
import { ActorType, Permission } from './permissions.types';

@Injectable()
export class ActorAuthGuard implements CanActivate {
  constructor(
    protected readonly permissionService: PermissionService,
    protected readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.actor = await this.authenticateRequest(request);
    return true;
  }

  protected async authenticateRequest(
    request: Request,
  ): Promise<AuthenticatedActor> {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type !== 'Bearer' || !token) {
        throw new ForbiddenException('Invalid authorization header');
      }

      const actor = await this.permissionService.authenticateToken(token);
      if (!actor) {
        throw new ForbiddenException('Invalid bearer token');
      }

      return actor;
    }

    const cookieToken = getAuthCookieToken(request, this.configService);
    if (!cookieToken) {
      throw new ForbiddenException('Missing authorization credentials');
    }
    if (cookieToken.includes(':')) {
      throw new ForbiddenException('Invalid cookie token');
    }

    const actor = await this.permissionService.authenticateToken(cookieToken);
    if (!actor) {
      throw new ForbiddenException('Invalid cookie token');
    }

    return actor;
  }
}

@Injectable()
export class PermissionGuard extends ActorAuthGuard {
  constructor(
    permissionService: PermissionService,
    configService: ConfigService<EnvironmentVariables>,
    private readonly reflector: Reflector,
  ) {
    super(permissionService, configService);
  }

  override async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const actor = await this.authenticateRequest(request);
    request.actor = actor;

    const requiredActorTypes = this.reflector.getAllAndOverride<ActorType[]>(
      REQUIRED_ACTOR_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredActorTypes && !requiredActorTypes.includes(actor.type)) {
      throw new ForbiddenException('Actor type is not allowed');
    }

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions?.length) return true;

    const permissionContext = getPermissionContext(request, actor);

    for (const permission of requiredPermissions) {
      const allowed = await this.permissionService.hasPermission(
        actor,
        permission,
        permissionContext,
      );
      if (!allowed) {
        throw new ForbiddenException(`Missing permission ${permission}`);
      }
    }

    return true;
  }
}

function getPermissionContext(
  request: Request,
  actor: AuthenticatedActor,
): PermissionContext {
  const params = request.params as Record<string, unknown>;
  const query = request.query as Record<string, unknown>;
  const body = (request.body ?? {}) as Record<string, unknown>;

  return {
    guildId: firstString(
      params.guildId,
      params.guild_id,
      query.guild_id,
      body.guild_id,
    ),
    targetUserId:
      firstString(params.userId, params.user_id, query.user_id, body.user_id) ??
      (actor.type === ActorType.User ? actor.id : undefined),
  };
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}
