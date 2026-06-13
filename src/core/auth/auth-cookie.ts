import { isIP } from 'node:net';
import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request } from 'express';

import { Environment, type EnvironmentVariables } from '#config/env';

export const DEFAULT_AUTH_COOKIE_NAME = 'rgd_access_token';

export function getAuthCookieName(
  config: ConfigService<EnvironmentVariables>,
): string {
  return config.get<string>('AUTH_COOKIE_NAME') || DEFAULT_AUTH_COOKIE_NAME;
}

export function getAuthCookieOptions(
  config: ConfigService<EnvironmentVariables>,
): CookieOptions {
  const domain = normalizeAuthCookieDomain(
    config.get<string>('AUTH_COOKIE_DOMAIN'),
  );
  const environment = config.get<Environment>('NODE_ENV');

  return {
    domain,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: environment !== Environment.Development,
  };
}

export function normalizeAuthCookieDomain(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const host = parseCookieDomainHost(trimmed);
  if (!host || host === 'localhost' || isIP(host)) return undefined;

  const normalized = host.startsWith('.') ? host : host.toLowerCase();
  if (
    !/^\.?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      normalized,
    )
  ) {
    return undefined;
  }

  return normalized;
}

export function getAuthCookieToken(
  request: Request,
  config: ConfigService<EnvironmentVariables>,
): string | undefined {
  return getCookieValue(request.headers.cookie, getAuthCookieName(config));
}

function getCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (rawName !== name) continue;

    const value = rawValue.join('=');
    return value ? decodeURIComponent(value) : undefined;
  }

  return undefined;
}

function parseCookieDomainHost(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    const withoutPort = value.replace(/:\d+$/, '');
    return withoutPort || undefined;
  }
}
