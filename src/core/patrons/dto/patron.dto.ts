import { ApiProperty } from '@nestjs/swagger';

export class PatronUserDto {
  @ApiProperty({
    description: 'Discord User ID.',
    example: '123456789012345678',
  })
  id: string;

  @ApiProperty({ example: 'damir' })
  username: string;

  @ApiProperty({ example: 'https://cdn.discordapp.com/avatars/...' })
  avatar_url: string;

  @ApiProperty({ example: 'https://cdn.discordapp.com/banners/...' })
  banner: string;
}

export class PatronDto {
  @ApiProperty({ type: PatronUserDto })
  user: PatronUserDto;

  @ApiProperty({ example: 10.5 })
  value: number;
}
