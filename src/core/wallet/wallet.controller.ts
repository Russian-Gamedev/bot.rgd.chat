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
  RequireActorTypes,
  RequirePermissions,
} from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import {
  ActorType,
  type AuthenticatedActor,
  Permission,
} from '#core/permissions/permissions.types';
import { UserService } from '#core/users/users.service';

import {
  CreditDebitDto,
  GuildQueryDto,
  TransferDto,
  WalletHistoryQueryDto,
} from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly userService: UserService,
  ) {}

  @Get('balance')
  @UseGuards(PermissionGuard)
  @RequireActorTypes(ActorType.User)
  @RequirePermissions(Permission.WalletReadOwn)
  @ApiOperation({ summary: 'Get own balance' })
  async getOwnBalance(@Actor() actor: AuthenticatedActor) {
    const balance = await this.walletService.getBalance(actor.id);
    return { balance: balance.toString() };
  }

  @Get('history')
  @UseGuards(PermissionGuard)
  @RequireActorTypes(ActorType.User)
  @RequirePermissions(Permission.WalletReadOwn)
  @ApiOperation({ summary: 'Get own transaction history' })
  async getOwnHistory(
    @Actor() actor: AuthenticatedActor,
    @Query() query: WalletHistoryQueryDto,
  ) {
    const history = await this.walletService.getHistory(actor.id, null, query);
    return history.map((tx) => ({
      id: tx.id,
      guild_id: tx.guild_id.toString(),
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
  @ApiOperation({ summary: 'Get user balance (system)' })
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
  @ApiOperation({ summary: 'Get user transaction history (system)' })
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
      guild_id: tx.guild_id.toString(),
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
  @ApiOperation({ summary: 'Credit coins to a user (system)' })
  async creditUser(@Body() dto: CreditDebitDto) {
    const user = await this.userService.findOrCreateMember(
      dto.guild_id,
      dto.user_id,
    );
    const tx = await this.walletService.credit(
      user,
      BigInt(dto.amount),
      dto.reason,
    );
    return {
      transaction_id: tx.id,
      balance_after: tx.balance_after.toString(),
    };
  }

  @Post('debit')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  @ApiOperation({ summary: 'Debit coins from a user (system)' })
  async debitUser(@Body() dto: CreditDebitDto) {
    const user = await this.userService.findOrCreateMember(
      dto.guild_id,
      dto.user_id,
    );
    const tx = await this.walletService.debit(
      user,
      BigInt(dto.amount),
      dto.reason,
    );
    return {
      transaction_id: tx.id,
      balance_after: tx.balance_after.toString(),
    };
  }

  @Post('transfer')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.WalletManage)
  @ApiOperation({ summary: 'Transfer coins between users (system)' })
  async transferBetweenUsers(@Body() dto: TransferDto) {
    const fromUser = await this.userService.findOrCreate(
      dto.guild_id,
      dto.from_user_id,
    );
    const toUser = await this.userService.findOrCreate(
      dto.guild_id,
      dto.to_user_id,
    );
    const [debitTx, creditTx] = await this.walletService.transfer(
      fromUser,
      toUser,
      BigInt(dto.amount),
      dto.reason,
    );
    return {
      debit_transaction_id: debitTx.id,
      credit_transaction_id: creditTx.id,
      from_balance_after: debitTx.balance_after.toString(),
      to_balance_after: creditTx.balance_after.toString(),
    };
  }
}
