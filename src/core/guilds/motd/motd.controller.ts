import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { type AuthenticatedActor } from '#core/permissions/permissions.types';
import { WalletService } from '#core/wallet/wallet.service';

import { CreateMotdDto } from './dto/motd.dto';
import { MOTD_COST } from './motd.constants';
import { MotdService } from './motd.service';

@Controller('motd')
export class MotdController {
  constructor(
    private readonly motdService: MotdService,
    private readonly walletService: WalletService,
  ) {}

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

  @Post()
  @UseGuards(ActorAuthGuard)
  async addMotd(
    @Actor() actor: AuthenticatedActor,
    @Body() dto: CreateMotdDto,
  ) {
    const userId = getActorUserId(actor);
    const tx = await this.walletService.debit(userId, MOTD_COST, 'motd:add');
    const motd = await this.motdService.addMotd(dto.content, BigInt(userId));
    return {
      id: motd.id,
      content: motd.content,
      balance_after: tx.balance_after.toString(),
    };
  }
}
