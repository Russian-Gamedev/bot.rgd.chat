import {
  BadRequestException,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from './auth.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}

@Injectable()
export class DiscordAuthGuard extends AuthGuard('discord') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err) {
      throw mapDiscordAuthError(err);
    }

    if (!user) {
      throw mapDiscordAuthError(info);
    }

    return user;
  }
}

function mapDiscordAuthError(error: unknown) {
  const authError = toAuthError(error);

  if (authError.code === 'invalid_grant') {
    return new BadRequestException({
      error: 'discord_invalid_grant',
      message:
        'Discord rejected the authorization code. Start login again and make sure the redirect URL matches the Discord application settings.',
    });
  }

  if (authError.code === 'invalid_client') {
    return new UnauthorizedException({
      error: 'discord_invalid_client',
      message:
        'Discord rejected the OAuth client credentials. Check DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.',
    });
  }

  if (authError.code === 'access_denied') {
    return new BadRequestException({
      error: 'discord_access_denied',
      message: 'Discord authorization was cancelled or denied.',
    });
  }

  return new BadRequestException({
    error: 'discord_auth_failed',
    message: authError.message || 'Discord authorization failed.',
  });
}

function toAuthError(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== 'object') return {};

  return {
    code: 'code' in error ? String(error.code) : undefined,
    message: 'message' in error ? String(error.message) : undefined,
  };
}
