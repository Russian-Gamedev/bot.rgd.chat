import {
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Res,
} from '@nestjs/common';
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
  public async getMembersStats() {
    try {
      return await this.discordService.getMembersStats();
    } catch {
      throw new InternalServerErrorException('Failed to fetch member stats');
    }
  }

  @Get('/invite/:code')
  public async getInviteInfo(@Param('code') code: string) {
    return this.discordService.getInviteInfo(code);
  }
}
