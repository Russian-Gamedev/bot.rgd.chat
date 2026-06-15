import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DiscordTokenDto {
  @ApiProperty({ description: 'Discord OAuth authorization code' })
  @IsString()
  code: string;
}
