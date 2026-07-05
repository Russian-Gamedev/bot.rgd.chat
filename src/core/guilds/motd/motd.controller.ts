import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';

import { CurrentMotdResponseDto, MotdDto } from './dto/motd.dto';
import { MotdService } from './motd.service';

@ApiTags('MOTD')
@Controller('motd')
export class MotdController {
  constructor(private readonly motdService: MotdService) {}

  @Get()
  @ApiOperation({ summary: 'Get current message of the day' })
  @ApiOkResponse({ type: CurrentMotdResponseDto })
  async getCurrentMotd() {
    const motd = await this.motdService.getCurrentMotd();
    return { motd };
  }

  @Get('list')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOperation({ summary: 'List configured messages of the day' })
  @ApiOkResponse({ type: [MotdDto] })
  async listMotds() {
    return this.motdService.listMotds();
  }
}
