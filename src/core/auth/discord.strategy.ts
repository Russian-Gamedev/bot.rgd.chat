import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-discord';

import { EnvironmentVariables } from '#config/env';
import { getAvatarUrl } from '#lib/utils';

interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(config: ConfigService<EnvironmentVariables>) {
    super({
      clientID: config.getOrThrow<string>('DISCORD_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('DISCORD_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('DISCORD_REDIRECT_URI'),
      scope: ['identify'],
    });
  }

  async validate(
    _access_token: string,
    _refresh_token: string,
    profile: DiscordProfile,
  ) {
    return {
      user_id: profile.id,
      username: profile.username,
      avatarUrl: getAvatarUrl(profile.id, profile.avatar),
      nickname: profile.global_name ?? null,
    };
  }
}
