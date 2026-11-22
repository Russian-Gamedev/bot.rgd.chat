import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import { NecordPaginationService } from '@necord/pagination';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { WsAdapter } from '@nestjs/platform-ws';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import OpenAI from 'openai';
import { pgliteOrmConfig } from '#common/mikro-orm.pglite.config';
import { RedisConnectionService } from '#common/redis.module';
import { S3StorageService } from '#common/s3/s3-storage.service';
import { DiscordModule } from '#core/discord/discord.module';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { PatronTagService } from '#core/users/patron-tag.service';
import { AppModule } from '#root/app.module';
import { MockExternalServicesModule } from './helpers/mock-modules';
import { MockRedis } from './helpers/mock-redis';
import { ensureUuidv7Function } from './helpers/pglite-setup';

@Global()
@Module({
  providers: [{ provide: NecordPaginationService, useValue: {} }],
  exports: [NecordPaginationService],
})
class NecordPaginationStubModule {}

const USER_ID = '100000000000000001';
const USERNAME = 'alice';
const AVATAR_URL = `https://cdn.example/avatars/${USER_ID}.webp`;
const AUTH_COOKIE_NAME = 'rgd_access_token';

const mockRedis = new MockRedis();
const patronTagStub = {
  getTag: async () => null,
  refresh: async () => undefined,
  onApplicationBootstrap: () => undefined,
};

describe('HTTP server on the NodeAdapter', () => {
  let app: NestNodeApplication;
  let orm: MikroORM;
  let baseUrl: string;
  let wsUrl: string;
  let jwtToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(pgliteOrmConfig),
        MockExternalServicesModule,
        NecordPaginationStubModule,
      ],
    })
      .overrideProvider(Redis)
      .useValue(mockRedis)
      .overrideProvider(RedisConnectionService)
      .useValue(new RedisConnectionService(mockRedis as unknown as Redis))
      .overrideProvider(OpenAI)
      .useValue({})
      .overrideProvider(S3StorageService)
      .useValue({})
      .overrideProvider(PatronTagService)
      .useValue(patronTagStub)
      .overrideModule(DiscordModule)
      .useModule(class {})
      .compile();

    orm = moduleRef.get(MikroORM);
    await ensureUuidv7Function(orm);
    await orm.schema.refresh();

    // The pglite schema is created from entities, so the migration history has
    // to be filled in for DatabaseModule.onModuleInit() to see nothing pending.
    const pendingMigrations = await orm.migrator.getPending();
    const connection = orm.em.getConnection();
    for (const migration of pendingMigrations) {
      await connection.execute(
        'insert into mikro_orm_migrations (name) values (?)',
        [migration.name],
      );
    }

    const em = orm.em.fork();
    const profile = new UserProfileEntity();
    profile.user_id = BigInt(USER_ID);
    profile.username = USERNAME;
    profile.nickname = 'Ali';
    profile.avatar_url = AVATAR_URL;
    profile.banner = null;
    profile.banner_alt = null;
    profile.about = null;
    em.persist(profile);
    await em.flush();

    app = moduleRef.createNestApplication<NestNodeApplication>(
      new NodeAdapter(),
      { logger: false },
    );
    app.enableCors({
      credentials: true,
      origin: ['http://localhost:5173'],
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useWebSocketAdapter(new WsAdapter(app));

    const server = await app.listen(0, '127.0.0.1');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('The HTTP server did not report a TCP port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    wsUrl = `ws://127.0.0.1:${address.port}/bar`;
    jwtToken = await app
      .get(JwtService)
      .signAsync({ user_id: USER_ID, username: USERNAME });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await orm?.close(true);
  });

  it('boots Nest on node:http and serves JSON with CORS headers', async () => {
    expect(app.getHttpAdapter().getType()).toBe('node');

    const response = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  it('answers CORS preflight requests', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'GET',
    );
  });

  it('streams static files through @Res() sendFile', async () => {
    const response = await fetch(`${baseUrl}/favicon.ico`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');

    const actual = Buffer.from(await response.arrayBuffer());
    const expected = Buffer.from(
      await Bun.file('./assets/icon.webp').arrayBuffer(),
    );
    expect(actual.equals(expected)).toBe(true);
  });

  it('returns JSON for unmatched routes', async () => {
    const response = await fetch(`${baseUrl}/definitely-missing`);

    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      statusCode: number;
      message: string;
    };
    expect(body.statusCode).toBe(404);
    expect(body.message).toContain('Cannot GET /definitely-missing');
  });

  it('validates query DTOs through the global ValidationPipe', async () => {
    const response = await fetch(`${baseUrl}/users/search?q=a`);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { message: string[] };
    expect(body.message.join(' ')).toContain(
      'q must be longer than or equal to 2 characters',
    );
  });

  it('looks users up in the database and serializes the profile', async () => {
    const response = await fetch(`${baseUrl}/users/${USERNAME}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: USER_ID,
      username: USERNAME,
      nickname: 'Ali',
      avatarUrl: AVATAR_URL,
    });
  });

  it('redirects avatar extension URLs with a 308', async () => {
    const response = await fetch(`${baseUrl}/users/${USERNAME}.png`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      `https://cdn.example/avatars/${USER_ID}.png`,
    );
  });

  it('rejects authenticated routes without credentials', async () => {
    const response = await fetch(`${baseUrl}/users/me`);

    expect(response.status).toBe(403);
  });

  it('starts the Discord OAuth flow through passport', async () => {
    const response = await fetch(`${baseUrl}/auth/discord`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/oauth2/authorize');
    expect(location).toContain('client_id=mock');
  });

  it('authenticates a JWT from the auth cookie', async () => {
    const response = await fetch(`${baseUrl}/users/me`, {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${jwtToken}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      permissions: unknown;
    };
    expect(body.id).toBe(USER_ID);
    expect(body.permissions).toEqual({ global: [], guilds: {} });
  });

  it('parses JSON bodies and persists profile updates', async () => {
    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${jwtToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        activityPublic: true,
        bannerAlt: 'https://cdn.example/banner.png',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: USER_ID,
      activityPublic: true,
      bannerAlt: 'https://cdn.example/banner.png',
    });
  });

  it('rejects invalid JSON bodies with a 400', async () => {
    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${jwtToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bannerAlt: 'not-a-url' }),
    });

    expect(response.status).toBe(400);
  });

  it('clears the auth cookie on logout', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, { method: 'POST' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('serves Prometheus metrics through @Res()', async () => {
    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const text = await response.text();
    expect(text).toContain('rgd_bot_process_cpu_user_seconds_total');
    expect(text).toMatch(/rgd_bot_http_requests_total\{[^}]*method="GET"/);
  });

  it('upgrades WebSocket clients through the WsAdapter', async () => {
    const message = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('WebSocket connection timed out'));
      }, 5_000);

      socket.onmessage = (event) => {
        clearTimeout(timeout);
        socket.close();
        resolve(String(event.data));
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed'));
      };
    });

    const payload = JSON.parse(message) as {
      type: string;
      data: { client_id: string; guilds: unknown[] };
    };
    expect(payload.type).toBe('connected');
    expect(payload.data.client_id).toBeString();
    expect(payload.data.guilds).toEqual([]);
  });
});
