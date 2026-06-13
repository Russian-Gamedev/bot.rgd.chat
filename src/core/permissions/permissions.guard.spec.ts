import { describe, expect, it, mock } from 'bun:test';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '#config/env';
import { ActorAuthGuard } from './permissions.guard';
import type { PermissionService } from './permissions.service';
import { ActorType } from './permissions.types';

describe('ActorAuthGuard', () => {
  it('authenticates Bearer token before cookie token', async () => {
    const permissionService = {
      authenticateToken: mock(async (token: string) => ({
        type: ActorType.User,
        id: token,
        username: 'user',
      })),
    } as unknown as PermissionService;
    const guard = new ActorAuthGuard(
      permissionService,
      createConfigService('auth_cookie'),
    );
    const request = {
      headers: {
        authorization: 'Bearer bearer-token',
        cookie: 'auth_cookie=cookie-token',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(permissionService.authenticateToken).toHaveBeenCalledWith(
      'bearer-token',
    );
    expect(request.actor).toEqual({
      type: ActorType.User,
      id: 'bearer-token',
      username: 'user',
    });
  });

  it('authenticates user JWT from cookie when Bearer header is missing', async () => {
    const permissionService = {
      authenticateToken: mock(async (token: string) => ({
        type: ActorType.User,
        id: token,
        username: 'user',
      })),
    } as unknown as PermissionService;
    const guard = new ActorAuthGuard(
      permissionService,
      createConfigService('auth_cookie'),
    );
    const request = {
      headers: {
        cookie: 'auth_cookie=cookie-token',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(permissionService.authenticateToken).toHaveBeenCalledWith(
      'cookie-token',
    );
  });

  it('rejects bot-like tokens from cookies', async () => {
    const permissionService = {
      authenticateToken: mock(async () => null),
    } as unknown as PermissionService;
    const guard = new ActorAuthGuard(
      permissionService,
      createConfigService('auth_cookie'),
    );
    const request = {
      headers: {
        cookie: 'auth_cookie=1%3Abot-token',
      },
    } as Record<string, unknown>;

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
    expect(permissionService.authenticateToken).not.toHaveBeenCalled();
  });
});

function createConfigService(
  cookieName: string,
): ConfigService<EnvironmentVariables> {
  return {
    get: mock((key: string) => {
      if (key === 'AUTH_COOKIE_NAME') return cookieName;
      return undefined;
    }),
  } as unknown as ConfigService<EnvironmentVariables>;
}

function createContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
