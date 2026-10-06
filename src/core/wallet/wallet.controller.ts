import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { getActorUserId } from '#core/permissions/actor-user-id';
import {
  Actor,
  RequirePermissions,
} from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import {
  type AuthenticatedActor,
  Permission,
} from '#core/permissions/permissions.types';

import {
  CreditDebitDto,
  GuildQueryDto,
  TransferDto,
  WalletHistoryQueryDto,
} from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletReadOwn)
  async getOwnBalance(@Actor() actor: AuthenticatedActor) {
    const userId = getActorUserId(actor);
    const balance = await this.walletService.getBalance(userId);
    return { balance: balance.toString() };
  }

  @Get('history')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletReadOwn)
  async getOwnHistory(
    @Actor() actor: AuthenticatedActor,
    @Query() query: WalletHistoryQueryDto,
  ) {
    const userId = getActorUserId(actor);
    const history = await this.walletService.getHistory(userId, null, query);
    return history.map((tx) => ({
      id: tx.id,
      guild_id: tx.guild_id?.toString() ?? null,
      amount: tx.amount.toString(),
      balance_after: tx.balance_after.toString(),
      type: tx.type,
      reason: tx.reason,
      related_user_id: tx.related_user_id?.toString() ?? null,
      metadata: tx.metadata,
      created_at: tx.createdAt,
    }));
  }

  @Get('/balance/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  async getUserBalance(@Param('userId') userId: string) {
    const balance = await this.walletService.getBalance(userId);
    return {
      user_id: userId,
      balance: balance.toString(),
    };
  }

  @Get('history/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  async getUserHistory(
    @Param('userId') userId: string,
    @Query() query: GuildQueryDto & WalletHistoryQueryDto,
  ) {
    const history = await this.walletService.getHistory(
      userId,
      query.guild_id,
      query,
    );
    return history.map((tx) => ({
      id: tx.id,
      guild_id: tx.guild_id?.toString() ?? null,
      amount: tx.amount.toString(),
      balance_after: tx.balance_after.toString(),
      type: tx.type,
      reason: tx.reason,
      related_user_id: tx.related_user_id?.toString() ?? null,
      metadata: tx.metadata,
      created_at: tx.createdAt,
    }));
  }

  @Post('credit')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  async creditUser(@Body() dto: CreditDebitDto) {
    const tx = await this.walletService.credit(
      dto.user_id,
      BigInt(dto.amount),
      dto.reason,
      { guildId: dto.guild_id ?? null },
    );
    return {
      transaction_id: tx.id,
      balance_after: tx.balance_after.toString(),
    };
  }

  @Post('debit')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  async debitUser(@Body() dto: CreditDebitDto) {
    const tx = await this.walletService.debit(
      dto.user_id,
      BigInt(dto.amount),
      dto.reason,
      { guildId: dto.guild_id ?? null },
    );
    return {
      transaction_id: tx.id,
      balance_after: tx.balance_after.toString(),
    };
  }

  @Post('transfer')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  async transferBetweenUsers(@Body() dto: TransferDto) {
    const [debitTx, creditTx] = await this.walletService.transfer(
      dto.from_user_id,
      dto.to_user_id,
      BigInt(dto.amount),
      dto.reason,
      { guildId: dto.guild_id ?? null },
    );
    return {
      debit_transaction_id: debitTx.id,
      credit_transaction_id: creditTx.id,
      from_balance_after: debitTx.balance_after.toString(),
      to_balance_after: creditTx.balance_after.toString(),
    };
  }
}
