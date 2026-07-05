import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DiscordMembersStatsDto {
  @ApiProperty({ example: 1024 })
  total: number;

  @ApiProperty({ example: 128 })
  online: number;
}

export class DiscordInviteInfoDto {
  @ApiProperty({ example: 'rgd' })
  code: string;

  @ApiProperty({ example: 'Russian Gamedev' })
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ example: 1024, nullable: true })
  memberCount?: number | null;

  @ApiPropertyOptional({ example: 128, nullable: true })
  presenceCount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt?: Date | null;

  @ApiProperty({ example: 'https://discord.gg/rgd' })
  url: string;

  @ApiPropertyOptional({ nullable: true })
  icon_url: string | null;

  @ApiPropertyOptional({ nullable: true })
  banner_url: string | null;
}
