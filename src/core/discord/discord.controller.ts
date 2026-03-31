import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { type Response } from 'express';

import { DiscordService } from './discord.service';

@Controller('discord')
export class DiscordController {
  constructor(private readonly discordService: DiscordService) {}

  @Get('emoji/:emoji{/:size}')
  public async getEmojiImage(
    @Param('emoji') emoji: string,
    @Param('size') size = 128,
    @Res() res: Response,
  ) {
    const url = await this.discordService.getEmojiImage(emoji, size);
    if (!url) return res.sendStatus(404);
    return res.redirect(url);
  }

  @Get('/members')
  @ApiResponse({ description: 'Get statistics about members', status: 200 })
  public async getMembersStats() {
    return this.discordService.getMembersStats();
  }

  @Get('/invite/:code')
  @ApiResponse({ description: 'Get invite information', status: 200 })
  public async getInviteInfo(@Param('code') code: string) {
    return this.discordService.getInviteInfo(code);
  }
}
