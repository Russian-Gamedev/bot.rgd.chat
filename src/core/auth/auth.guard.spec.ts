import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '@nestjs/common';

import { DiscordAuthGuard } from './auth.guard';

describe('DiscordAuthGuard', () => {
  it('maps invalid Discord OAuth codes to a readable 400 error', () => {
    const guard = new DiscordAuthGuard();

    expect(() =>
      guard.handleRequest(
        {
          code: 'invalid_grant',
          message: 'Invalid "code" in request.',
        },
        null,
        null,
      ),
    ).toThrow(BadRequestException);
  });
});
