import { IsString } from 'class-validator';

export class DiscordTokenDto {
  @IsString()
  code: string;
}
