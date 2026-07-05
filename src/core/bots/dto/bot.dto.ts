import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Permission } from '#core/permissions/permissions.types';

export class BotDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Status Bot' })
  name: string;

  @ApiProperty({
    description: 'Discord user ID of the bot owner.',
    example: '123456789012345678',
  })
  ownerId: string;

  @ApiPropertyOptional({
    description: 'Discord user ID represented by this bot token, if linked.',
    example: '234567890123456789',
    nullable: true,
  })
  botUserId: string | null;

  @ApiProperty({ enum: Permission, isArray: true })
  permissions: Permission[];

  @ApiPropertyOptional({ nullable: true })
  lastUsedAt?: Date;
}
