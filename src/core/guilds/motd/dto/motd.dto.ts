import { ApiProperty } from '@nestjs/swagger';

export class CurrentMotdResponseDto {
  @ApiProperty({ example: 'Добро пожаловать в RGD!', nullable: true })
  motd: string | null;
}

export class MotdAuthorDto {
  @ApiProperty({ example: 'damir' })
  username: string;

  @ApiProperty({ example: 'https://cdn.discordapp.com/avatars/...' })
  avatar_url: string;

  @ApiProperty({ example: '123456789012345678' })
  id: string;
}

export class MotdDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Добро пожаловать в RGD!' })
  content: string;

  @ApiProperty({ type: MotdAuthorDto })
  user: MotdAuthorDto;
}
