import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
} from '@nestjs/swagger';

export const USER_COOKIE_AUTH = 'UserAuthCookie';
export const USER_BEARER_AUTH = 'UserBearerAuth';
export const BOT_BEARER_AUTH = 'BotBearerAuth';

export function ApiUserAuth() {
  return applyDecorators(
    ApiCookieAuth(USER_COOKIE_AUTH),
    ApiBearerAuth(USER_BEARER_AUTH),
    ApiForbiddenResponse({
      description:
        'Missing or invalid user credentials, actor type is not allowed, or a required permission is missing.',
    }),
  );
}

export function ApiBotAuth() {
  return applyDecorators(
    ApiBearerAuth(BOT_BEARER_AUTH),
    ApiForbiddenResponse({
      description:
        'Missing or invalid bot bearer token, actor type is not allowed, or a required permission is missing.',
    }),
  );
}

export function ApiActorAuth() {
  return applyDecorators(
    ApiCookieAuth(USER_COOKIE_AUTH),
    ApiBearerAuth(USER_BEARER_AUTH),
    ApiBearerAuth(BOT_BEARER_AUTH),
    ApiForbiddenResponse({
      description:
        'Missing or invalid actor credentials, actor type is not allowed, or a required permission is missing.',
    }),
  );
}
