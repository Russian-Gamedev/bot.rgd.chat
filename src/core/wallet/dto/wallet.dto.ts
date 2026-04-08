import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Discord User ID' })
  @IsString()
  user_id: string;

  @ApiProperty({ description: 'Discord Guild ID' })
  @IsString()
  guild_id: string;

  @ApiProperty({ description: 'Amount (as string for bigint safety)' })
  @IsNumberString()
  amount: string;

  @ApiProperty({ description: 'Reason for the operation' })
  @IsString()
  reason: string;
}

export class TransferDto {
  @ApiProperty({ description: 'Source Discord User ID' })
  @IsString()
  from_user_id: string;

  @ApiProperty({ description: 'Target Discord User ID' })
  @IsString()
  to_user_id: string;

  @ApiProperty({ description: 'Discord Guild ID' })
  @IsString()
  guild_id: string;

  @ApiProperty({ description: 'Amount (as string for bigint safety)' })
  @IsNumberString()
  amount: string;

  @ApiPropertyOptional({ description: 'Reason for the transfer' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class WalletHistoryQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: WalletTransactionType })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;
}

export class GuildQueryDto {
  @ApiProperty({ description: 'Discord Guild ID' })
  @IsString()
  guild_id: string;
}
