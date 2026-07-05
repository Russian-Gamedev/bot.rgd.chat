import { ApiProperty } from '@nestjs/swagger';

export class GuildEventMessageDto {
  @ApiProperty({ example: 'Welcome, {user}!' })
  message: string;
}
