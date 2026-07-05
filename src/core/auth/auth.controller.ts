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
import {
  ApiBadRequestResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { OkResponseDto } from '#common/dto/openapi.dto';
import { EnvironmentVariables } from '#config/env';
import { DiscordAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthProfile } from './auth.type';
import { getAuthCookieName, getAuthCookieOptions } from './auth-cookie';
import { AccessTokenResponseDto } from './dto/auth-response.dto';
import { DiscordTokenDto } from './dto/discord-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  @Post('/discord/token')
  @ApiOperation({
    summary: 'Exchange Discord OAuth code for a Discord access token',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiBadRequestResponse({
    description: 'Discord rejected the OAuth authorization code or client.',
  })
  async token(@Body() body: DiscordTokenDto) {
    const { code } = body;
    return this.authService.exchangeCodeForToken(code);
  }

  @Get('/discord')
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Start Discord OAuth login' })
  @ApiFoundResponse({ description: 'Redirects to Discord OAuth.' })
  async login() {
    ///
  }

  @Get('/discord/callback')
  @UseGuards(DiscordAuthGuard)
  @ApiOperation({ summary: 'Handle Discord OAuth callback' })
  @ApiFoundResponse({
    description:
      'Sets the user JWT auth cookie and redirects to BASE_URL for browser requests.',
  })
  @ApiOkResponse({
    description:
      'For JSON requests, returns the user JWT token instead of redirecting.',
    type: AccessTokenResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Discord OAuth callback failed or Discord rejected the code.',
  })
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
  @ApiOperation({ summary: 'Clear user auth cookie' })
  @ApiOkResponse({ type: OkResponseDto })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(
      getAuthCookieName(this.configService),
      getAuthCookieOptions(this.configService),
    );

    return { ok: true };
  }
}
