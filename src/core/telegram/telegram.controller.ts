import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('/avatar/:chatId')
  @ApiOperation({ summary: 'Proxy Telegram channel avatar' })
  async getTelegramAvatar(
    @Param('chatId') chatId: string,
    @Res() res: Response,
  ) {
    const avatar = await this.telegramService.fetchChatAvatar(chatId);
    res.setHeader('Content-Type', avatar.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(avatar.buffer);
  }
}
