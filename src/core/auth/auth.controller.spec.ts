import { describe, expect, it, mock } from 'bun:test';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { Environment, type EnvironmentVariables } from '#config/env';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  it('sets auth cookie and redirects successful Discord login to BASE_URL without token query', async () => {
    const authService = {
      logIn: mock(async () => ({ access_token: 'jwt-token' })),
    } as unknown as AuthService;
    const configService = {
      getOrThrow: mock((key: string) => {
        const values: Record<string, string> = {
          BASE_URL: 'https://app.rgd.chat/auth/success',
        };
        return values[key];
      }),
      get: mock((key: string) => {
        const values: Record<string, string> = {
          AUTH_COOKIE_DOMAIN: '.rgd.chat',
          AUTH_COOKIE_NAME: 'auth_cookie',
          NODE_ENV: Environment.Production,
        };
        return values[key];
      }),
    } as unknown as ConfigService<EnvironmentVariables>;
    const controller = new AuthController(authService, configService);
    const cookie = mock(() => undefined);
    const redirect = mock(() => undefined);
    const response = { cookie, redirect } as unknown as Response;
    const request = {
      user: {
        user_id: '123',
        username: 'alice',
        avatarUrl: '',
        nickname: null,
      },
      headers: {},
    } as unknown as Request;

    await controller.callback(request, response);

    expect(cookie).toHaveBeenCalledWith('auth_cookie', 'jwt-token', {
      domain: '.rgd.chat',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    expect(redirect).toHaveBeenCalledWith('https://app.rgd.chat/auth/success');
  });

  it('clears auth cookie on logout', () => {
    const authService = {} as AuthService;
    const configService = {
      get: mock((key: string) => {
        const values: Record<string, string> = {
          AUTH_COOKIE_NAME: 'auth_cookie',
          NODE_ENV: Environment.Development,
        };
        return values[key];
      }),
    } as unknown as ConfigService<EnvironmentVariables>;
    const controller = new AuthController(authService, configService);
    const clearCookie = mock(() => undefined);
    const response = { clearCookie } as unknown as Response;

    expect(controller.logout(response)).toEqual({ ok: true });
    expect(clearCookie).toHaveBeenCalledWith('auth_cookie', {
      domain: undefined,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });
});
