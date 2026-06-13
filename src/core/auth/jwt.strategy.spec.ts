import { describe, expect, it, mock } from 'bun:test';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { EnvironmentVariables } from '#config/env';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('extracts bearer token before cookie token', () => {
    const strategy = createStrategy();
    const extractor = getJwtExtractor(strategy);
    const request = {
      headers: {
        authorization: 'Bearer bearer-token',
        cookie: 'auth_cookie=cookie-token',
      },
    } as Request;

    expect(extractor(request)).toBe('bearer-token');
  });

  it('extracts cookie token when bearer token is missing', () => {
    const strategy = createStrategy();
    const extractor = getJwtExtractor(strategy);
    const request = {
      headers: {
        cookie: 'auth_cookie=cookie-token',
      },
    } as Request;

    expect(extractor(request)).toBe('cookie-token');
  });
});

function createStrategy() {
  const config = {
    get: mock((key: string) => {
      const values: Record<string, string> = {
        AUTH_COOKIE_NAME: 'auth_cookie',
        JWT_SECRET: 'secret',
      };
      return values[key];
    }),
  } as unknown as ConfigService<EnvironmentVariables>;

  return new JwtStrategy(config);
}

function getJwtExtractor(strategy: JwtStrategy): (request: Request) => string {
  return (
    strategy as unknown as {
      _jwtFromRequest: (request: Request) => string;
    }
  )._jwtFromRequest;
}
