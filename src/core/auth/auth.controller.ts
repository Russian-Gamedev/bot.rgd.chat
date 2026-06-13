import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { EnvironmentVariables } from '#config/env';
import { DiscordAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthProfile } from './auth.type';
import { getAuthCookieName, getAuthCookieOptions } from './auth-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  @Post('/discord/token')
  async token(@Body() body: { code: string }) {
    const { code } = body;
    return this.authService.exchangeCodeForToken(code);
  }

  @Get('/discord')
  @UseGuards(DiscordAuthGuard)
  async login() {
    ///
  }

  @Get('/discord/callback')
  @UseGuards(DiscordAuthGuard)
  async callback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const redirectUri = this.configService.getOrThrow<string>('BASE_URL');

    ///@ts-expect-error -- req.user is added by passport
    const access_token = await this.authService.logIn(req.user as AuthProfile);
    res.cookie(
      getAuthCookieName(this.configService),
      access_token.access_token,
      getAuthCookieOptions(this.configService),
    );

    const url = new URL(redirectUri);

    if (req.headers['content-type']?.includes('application/json')) {
      res.json({ access_token: access_token.access_token });
      return;
    }

    res.redirect(url.toString());
  }

  @Post('/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(
      getAuthCookieName(this.configService),
      getAuthCookieOptions(this.configService),
    );

    return { ok: true };
  }
}
