import { Controller, Get, UseGuards } from '@nestjs/common';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';

import { MotdService } from './motd.service';

@Controller('motd')
export class MotdController {
  constructor(private readonly motdService: MotdService) {}

  @Get()
  async getCurrentMotd() {
    const motd = await this.motdService.getCurrentMotd();
    return { motd };
  }

  @Get('list')
  @UseGuards(ActorAuthGuard)
  async listMotds() {
    return this.motdService.listMotds();
  }
}
