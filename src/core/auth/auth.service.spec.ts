import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { EnvironmentVariables } from '#config/env';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { UserService } from '#core/users/users.service';
import { AuthService } from './auth.service';
import { AuthEntity } from './entities/auth.entity';

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: EntityRepository<AuthEntity>;
  let entityManager: EntityManager;
  let jwtService: JwtService;
  let userService: UserService;
  let configService: ConfigService<EnvironmentVariables>;

  beforeEach(() => {
    authRepository = {
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<AuthEntity>;

    entityManager = {
      persist: mock(() => entityManager),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;

    jwtService = {
      sign: mock((payload) => `signed:${JSON.stringify(payload)}`),
    } as unknown as JwtService;

    userService = {
      findOrCreateProfile: mock(() => Promise.resolve(createProfile())),
    } as unknown as UserService;

    configService = {
      getOrThrow: mock((key: string) => {
        const values: Record<string, string> = {
          DISCORD_CLIENT_ID: 'discord-client-id',
          DISCORD_CLIENT_SECRET: 'discord-client-secret',
          DISCORD_REDIRECT_URI: 'https://bot.rgd.chat/auth/discord/callback',
        };
        return values[key];
      }),
    } as unknown as ConfigService<EnvironmentVariables>;

    service = new AuthService(
      jwtService,
      authRepository,
      entityManager,
      userService,
      configService,
    );
  });

  it('creates user-only auth entry and signs JWT without guild id', async () => {
    const result = await service.logIn({
      user_id: '123',
      username: 'alice',
      avatarUrl: 'avatar.png',
      nickname: 'Alice',
    });

    expect(userService.findOrCreateProfile).toHaveBeenCalledWith('123');
    expect(entityManager.persist).toHaveBeenCalledTimes(2);
    expect(jwtService.sign).toHaveBeenCalledWith({
      user_id: '123',
      username: 'alice',
    });
    expect(result.access_token).toBe(
      'signed:{"user_id":"123","username":"alice"}',
    );
  });

  it('reuses existing auth entry for repeated login', async () => {
    const auth = new AuthEntity();
    auth.user_id = 123n;
    (authRepository.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
      auth,
    );

    await service.logIn({
      user_id: '123',
      username: 'new',
      avatarUrl: 'avatar.png',
      nickname: 'NewName',
    });

    expect(userService.findOrCreateProfile).toHaveBeenCalledWith('123');
    expect(jwtService.sign).toHaveBeenCalledWith({
      user_id: '123',
      username: 'new',
    });
  });

  it('throws a readable 4xx error when Discord rejects code exchange', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Invalid "code" in request.',
          }),
          { status: 400 },
        ),
    ) as unknown as typeof fetch;

    try {
      await expect(service.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Discord rejected the authorization code',
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('exchanges Discord code with configured redirect uri', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ access_token: 'discord-token' }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    try {
      await expect(
        service.exchangeCodeForToken('discord-code'),
      ).resolves.toEqual({ access_token: 'discord-token' });

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
      const request = fetchMock.mock.calls[0][1] as RequestInit;
      const body = request.body as URLSearchParams;

      expect(body.get('client_id')).toBe('discord-client-id');
      expect(body.get('client_secret')).toBe('discord-client-secret');
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('discord-code');
      expect(body.get('redirect_uri')).toBe(
        'https://bot.rgd.chat/auth/discord/callback',
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

function createProfile(
  overrides: Partial<UserProfileEntity> = {},
): UserProfileEntity {
  const profile = new UserProfileEntity();
  profile.user_id = 123n;
  profile.username = 'alice';
  profile.avatar_url = 'old-avatar.png';
  Object.assign(profile, overrides);
  return profile;
}
