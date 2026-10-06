import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { WalletTransactionType } from '../entities/wallet-transaction.entity';

export class CreditDebitDto {
  @IsString()
  user_id: string;

  @IsOptional()
  @IsString()
  guild_id?: string;

  @IsNumberString()
  amount: string;

  @IsString()
  reason: string;
}

export class TransferDto {
  @IsString()
  from_user_id: string;

  @IsString()
  to_user_id: string;

  @IsString()
  guild_id: string;

  @IsNumberString()
  amount: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class WalletHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;
}

export class GuildQueryDto {
  @IsString()
  guild_id: string;
}

export class WalletBalanceResponseDto {
  balance: string;
}

export class UserWalletBalanceResponseDto extends WalletBalanceResponseDto {
  user_id: string;
}

export class WalletTransactionDto {
  id: number;

  guild_id: string | null;

  amount: string;

  balance_after: string;

  type: WalletTransactionType;

  reason: string;

  related_user_id: string | null;

  metadata: Record<string, unknown>;

  created_at: Date;
}

export class WalletOperationResponseDto {
  transaction_id: number;

  balance_after: string;
}

export class WalletTransferResponseDto {
  debit_transaction_id: number;

  credit_transaction_id: number;

  from_balance_after: string;

  to_balance_after: string;
}
