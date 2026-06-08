import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-discord';

import { EnvironmentVariables } from '#config/env';

interface DiscordGuildProfile {
  id: string;
}

interface DiscordProfile {
  id: string;
  username: string;
  avatar?: string | null;
  guilds?: DiscordGuildProfile[];
}

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    super({
      clientID: config.getOrThrow<string>('DISCORD_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('DISCORD_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('DISCORD_REDIRECT_URI'),
      scope: ['identify', 'guilds'],
      passReqToCallback: true,
    });
  }

  private resolveGuildId(req: Request, profile: DiscordProfile) {
    const guilds = profile.guilds ?? [];
    const guildIds = new Set(guilds.map((guild) => guild.id));

    const requestedGuildId = req.query.guild_id;
    if (
      typeof requestedGuildId === 'string' &&
      guildIds.has(requestedGuildId)
    ) {
      return requestedGuildId;
    }

    const developmentGuildId = this.config.get<string>(
      'DISCORD_DEVELOPMENT_GUILD_ID',
    );
    if (developmentGuildId && guildIds.has(developmentGuildId)) {
      return developmentGuildId;
    }

    if (guilds.length === 1) {
      return guilds[0].id;
    }

    throw new UnauthorizedException(
      'Unable to determine target guild for login.',
    );
  }

  async validate(
    req: Request,
    _access_token: string,
    _refresh_token: string,
    profile: DiscordProfile,
  ) {
    return {
      user_id: profile.id,
      guild_id: this.resolveGuildId(req, profile),
      username: profile.username,
      avatarUrl: profile.avatar ?? '',
    };
  }
}
