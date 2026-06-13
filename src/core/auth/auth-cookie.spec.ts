import { describe, expect, it, mock } from 'bun:test';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { Environment, type EnvironmentVariables } from '#config/env';
import {
  DEFAULT_AUTH_COOKIE_NAME,
  getAuthCookieName,
  getAuthCookieOptions,
  getAuthCookieToken,
  normalizeAuthCookieDomain,
} from './auth-cookie';

describe('auth cookie helpers', () => {
  it('uses defaults and extracts token from cookies', () => {
    const config = {
      get: mock((key: string) => {
        if (key === 'NODE_ENV') return Environment.Development;
        return undefined;
      }),
    } as unknown as ConfigService<EnvironmentVariables>;
    const request = {
      headers: {
        cookie: 'theme=dark; rgd_access_token=user.jwt.token',
      },
    } as Request;

    expect(getAuthCookieName(config)).toBe(DEFAULT_AUTH_COOKIE_NAME);
    expect(getAuthCookieToken(request, config)).toBe('user.jwt.token');
    expect(getAuthCookieOptions(config)).toEqual({
      domain: undefined,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });

  it('uses configured cookie name and production domain', () => {
    const config = {
      get: mock((key: string) => {
        const values: Record<string, string> = {
          AUTH_COOKIE_DOMAIN: '.rgd.chat',
          AUTH_COOKIE_NAME: 'custom_auth',
          NODE_ENV: Environment.Production,
        };
        return values[key];
      }),
    } as unknown as ConfigService<EnvironmentVariables>;
    const request = {
      headers: {
        cookie: 'custom_auth=user.jwt.token',
      },
    } as Request;

    expect(getAuthCookieName(config)).toBe('custom_auth');
    expect(getAuthCookieToken(request, config)).toBe('user.jwt.token');
    expect(getAuthCookieOptions(config)).toEqual({
      domain: '.rgd.chat',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  });

  it('omits cookie domain for localhost, IP addresses, and host:port values', () => {
    expect(normalizeAuthCookieDomain('localhost')).toBeUndefined();
    expect(normalizeAuthCookieDomain('http://localhost:5173')).toBeUndefined();
    expect(normalizeAuthCookieDomain('192.168.1.3')).toBeUndefined();
    expect(normalizeAuthCookieDomain('192.168.1.3:5173')).toBeUndefined();
  });

  it('normalizes URL-like production cookie domains to hostnames', () => {
    expect(normalizeAuthCookieDomain('https://app.rgd.chat')).toBe(
      'app.rgd.chat',
    );
    expect(normalizeAuthCookieDomain('.rgd.chat')).toBe('.rgd.chat');
  });
});
