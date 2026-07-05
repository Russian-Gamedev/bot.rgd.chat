import {
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Res,
} from '@nestjs/common';
import {
  ApiFoundResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';
import { DiscordService } from './discord.service';
import {
  DiscordInviteInfoDto,
  DiscordMembersStatsDto,
} from './dto/discord.dto';

@ApiTags('Discord')
@Controller('discord')
export class DiscordController {
  constructor(private readonly discordService: DiscordService) {}

  @Get('emoji/:emoji{/:size}')
  @ApiOperation({ summary: 'Redirect to a Discord emoji image' })
  @ApiParam({ name: 'emoji', description: 'Emoji name.' })
  @ApiParam({
    name: 'size',
    description: 'Discord CDN image size.',
    required: false,
    example: 128,
  })
  @ApiFoundResponse({ description: 'Redirects to Discord CDN image URL.' })
  @ApiNotFoundResponse({ description: 'Emoji was not found.' })
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
  @ApiOperation({ summary: 'Get Discord member statistics' })
  @ApiOkResponse({ type: DiscordMembersStatsDto })
  @ApiInternalServerErrorResponse({
    description: 'Failed to fetch member stats.',
  })
  public async getMembersStats() {
    try {
      return await this.discordService.getMembersStats();
    } catch {
      throw new InternalServerErrorException('Failed to fetch member stats');
    }
  }

  @Get('/invite/:code')
  @ApiOperation({ summary: 'Get Discord invite information' })
  @ApiParam({ name: 'code', description: 'Discord invite code.' })
  @ApiOkResponse({ type: DiscordInviteInfoDto })
  @ApiNotFoundResponse({
    description: 'Invite or invite guild was not found.',
  })
  public async getInviteInfo(@Param('code') code: string) {
    return this.discordService.getInviteInfo(code);
  }
}
