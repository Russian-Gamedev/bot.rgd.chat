import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { BotTarget } from '#core/bots/bots.decorator';
import { BotApiGuard, BotScopes } from '#core/bots/bots.guard';
import { BotScope } from '#core/bots/bots.types';
import { BotEntity } from '#core/bots/entities/bot.entity';

import {
  MahoragaCaseResponseDto,
  MahoragaListQueryDto,
  MahoragaUnbanDto,
  ManualMahoragaCaseDto,
} from './dto/mahoraga.dto';
import { MahoragaService } from './mahoraga.service';

@ApiTags('Mahoraga')
@Controller('mahoraga')
@UseGuards(BotApiGuard)
export class MahoragaController {
  constructor(private readonly mahoragaService: MahoragaService) {}

  @Get('spammers')
  @BotScopes(BotScope.ManageMahoraga)
  @ApiOperation({ summary: 'List Mahoraga spammer cases' })
  async listCases(@Query() query: MahoragaListQueryDto) {
    const cases = await this.mahoragaService.listCases(query);
    return cases.map((mahoragaCase) =>
      MahoragaCaseResponseDto.fromEntity(mahoragaCase),
    );
  }

  @Get('spammers/:user_id')
  @BotScopes(BotScope.ManageMahoraga)
  @ApiOperation({ summary: 'Get Mahoraga spammer case by Discord user ID' })
  async getCase(@Param('user_id') userId: string) {
    const mahoragaCase = await this.mahoragaService.getCaseByUserId(userId);
    return MahoragaCaseResponseDto.fromEntity(mahoragaCase);
  }

  @Post('spammers')
  @BotScopes(BotScope.ManageMahoraga)
  @ApiOperation({ summary: 'Create or reopen a manual Mahoraga softban' })
  async createManualCase(
    @Body() dto: ManualMahoragaCaseDto,
    @BotTarget() bot: BotEntity,
  ) {
    const mahoragaCase = await this.mahoragaService.createManualCase(
      dto,
      bot.ownerId.toString(),
    );
    return MahoragaCaseResponseDto.fromEntity(mahoragaCase);
  }

  @Post('spammers/:user_id/unban')
  @BotScopes(BotScope.ManageMahoraga)
  @ApiOperation({ summary: 'Pardon Mahoraga case and remove softban roles' })
  async unban(
    @Param('user_id') userId: string,
    @Body() dto: MahoragaUnbanDto,
    @BotTarget() bot: BotEntity,
  ) {
    const result = await this.mahoragaService.pardonCase(
      userId,
      bot.ownerId.toString(),
      dto.reason,
    );
    return {
      case: MahoragaCaseResponseDto.fromEntity(result.case),
      results: result.results,
    };
  }

  @Post('spammers/:user_id/sync-softban')
  @BotScopes(BotScope.ManageMahoraga)
  @ApiOperation({ summary: 'Apply softban role to this user in all guilds' })
  async syncSoftban(@Param('user_id') userId: string) {
    return {
      results: await this.mahoragaService.syncSoftban(userId),
    };
  }
}
