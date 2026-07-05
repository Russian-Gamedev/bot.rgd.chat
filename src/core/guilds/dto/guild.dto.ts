import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GuildDto {
  @ApiProperty({
    description: 'Discord Guild ID.',
    example: '123456789012345678',
  })
  id: string;

  @ApiProperty({ example: 'Russian Gamedev' })
  name: string;

  @ApiProperty({
    description: 'Discord user ID of the guild owner.',
    example: '234567890123456789',
  })
  owner_id: string;

  @ApiPropertyOptional({ nullable: true })
  icon_url?: string | null;

  @ApiPropertyOptional({ nullable: true })
  custom_banner_url?: string | null;
}

export class GuildRoleDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    description: 'Discord Guild ID.',
    example: '123456789012345678',
  })
  guild_id: string;

  @ApiProperty({
    description: 'Discord Role ID.',
    example: '345678901234567890',
  })
  role_id: string;

  @ApiProperty({ example: 'Admin' })
  name: string;

  @ApiProperty({ example: '#ffcc00' })
  color: string;

  @ApiProperty({ example: 10 })
  position: number;
}
