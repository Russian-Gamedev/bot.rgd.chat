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

import {
  Actor,
  RequirePermissions,
} from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import {
  ActorType,
  type AuthenticatedActor,
  Permission,
} from '#core/permissions/permissions.types';

import {
  MahoragaCaseResponseDto,
  MahoragaListQueryDto,
  MahoragaUnbanDto,
  ManualMahoragaCaseDto,
} from './dto/mahoraga.dto';
import { MahoragaService } from './mahoraga.service';

@ApiTags('Mahoraga')
@Controller('mahoraga')
@UseGuards(PermissionGuard)
export class MahoragaController {
  constructor(private readonly mahoragaService: MahoragaService) {}

  @Get('spammers')
  @RequirePermissions(Permission.MahoragaManage)
  @ApiOperation({ summary: 'List Mahoraga spammer cases' })
  async listCases(@Query() query: MahoragaListQueryDto) {
    const cases = await this.mahoragaService.listCases(query);
    return cases.map((mahoragaCase) =>
      MahoragaCaseResponseDto.fromEntity(mahoragaCase),
    );
  }

  @Get('spammers/:user_id')
  @RequirePermissions(Permission.MahoragaManage)
  @ApiOperation({ summary: 'Get Mahoraga spammer case by Discord user ID' })
  async getCase(@Param('user_id') userId: string) {
    const mahoragaCase = await this.mahoragaService.getCaseByUserId(userId);
    return MahoragaCaseResponseDto.fromEntity(mahoragaCase);
  }

  @Post('spammers')
  @RequirePermissions(Permission.MahoragaManage)
  @ApiOperation({ summary: 'Create or reopen a manual Mahoraga softban' })
  async createManualCase(
    @Body() dto: ManualMahoragaCaseDto,
    @Actor() actor: AuthenticatedActor,
  ) {
    const mahoragaCase = await this.mahoragaService.createManualCase(
      dto,
      this.getModerationActorId(actor),
    );
    return MahoragaCaseResponseDto.fromEntity(mahoragaCase);
  }

  @Post('spammers/:user_id/unban')
  @RequirePermissions(Permission.MahoragaManage)
  @ApiOperation({ summary: 'Pardon Mahoraga case' })
  async unban(
    @Param('user_id') userId: string,
    @Body() dto: MahoragaUnbanDto,
    @Actor() actor: AuthenticatedActor,
  ) {
    const result = await this.mahoragaService.pardonCase(
      userId,
      this.getModerationActorId(actor),
      dto.reason,
    );
    return {
      case: MahoragaCaseResponseDto.fromEntity(result.case),
    };
  }

  @Post('spammers/:user_id/sync-softban')
  @RequirePermissions(Permission.MahoragaManage)
  @ApiOperation({ summary: 'Apply temporary Mahoraga ban in source guild' })
  async syncSoftban(@Param('user_id') userId: string) {
    return {
      result: await this.mahoragaService.syncSoftban(userId),
    };
  }

  private getModerationActorId(actor: AuthenticatedActor): string {
    return actor.type === ActorType.Bot
      ? actor.bot.ownerId.toString()
      : actor.id;
  }
}
