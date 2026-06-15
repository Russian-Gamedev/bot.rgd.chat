import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { EnvironmentVariables } from '#config/env';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { UserService } from '#core/users/users.service';
import { AuthProfile, JwtPayload } from './auth.type';
import { AuthEntity } from './entities/auth.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(AuthEntity)
    private readonly authRepository: EntityRepository<AuthEntity>,
    private readonly entityManager: EntityManager,
    private readonly userService: UserService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  async logIn(profile: AuthProfile) {
    const user = await this.userService.findOrCreateProfile(profile.user_id);
    user.username = profile.username;
    user.nickname = profile.nickname || user.nickname;
    user.avatar_url = profile.avatarUrl || user.avatar_url;

    let auth = await this.authRepository.findOne({
      user_id: user.user_id,
    });

    if (!auth) {
      auth = new AuthEntity();
      auth.user_id = user.user_id;

      this.entityManager.persist(user);
      this.entityManager.persist(auth);
      await this.entityManager.flush();

      this.logger.log(`Created new auth entry for user ${profile.username}`);
    } else {
      await this.entityManager.persist(user).flush();
    }
    return this.generateJwtToken(user);
  }

  private generateJwtToken(user: UserProfileEntity) {
    const payload: JwtPayload = {
      user_id: String(user.user_id),
      username: user.username,
    };

    const access_token = this.jwtService.sign(payload);

    return { access_token };
  }

  async exchangeCodeForToken(code: string) {
    return this.exchangeDiscordCode(code, { includeRedirectUri: true });
  }

  private async exchangeDiscordCode(
    code: string,
    options: { includeRedirectUri: boolean },
  ) {
    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('DISCORD_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>(
        'DISCORD_CLIENT_SECRET',
      ),
      grant_type: 'authorization_code',
      code,
    });

    if (options.includeRedirectUri) {
      params.set(
        'redirect_uri',
        this.configService.getOrThrow<string>('DISCORD_REDIRECT_URI'),
      );
    }

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const body = (await response.json()) as DiscordTokenResponse;

    if (!response.ok || !('access_token' in body)) {
      throw new BadRequestException({
        error: mapDiscordTokenError(body.error),
        message: getDiscordTokenErrorMessage(body.error),
        discordError: body.error,
        discordErrorDescription: body.error_description,
      });
    }

    return { access_token: body.access_token };
  }
}

type DiscordTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

function mapDiscordTokenError(error?: string) {
  if (error === 'invalid_grant') return 'discord_invalid_grant';
  if (error === 'invalid_client') return 'discord_invalid_client';
  if (error === 'access_denied') return 'discord_access_denied';
  return 'discord_token_exchange_failed';
}

function getDiscordTokenErrorMessage(error?: string) {
  if (error === 'invalid_grant') {
    return 'Discord rejected the authorization code. Start login again and make sure the redirect URL matches the Discord application settings.';
  }

  if (error === 'invalid_client') {
    return 'Discord rejected the OAuth client credentials. Check DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.';
  }

  if (error === 'access_denied') {
    return 'Discord authorization was cancelled or denied.';
  }

  return 'Discord token exchange failed.';
}
