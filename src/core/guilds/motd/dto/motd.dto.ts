import { IsString, MaxLength } from 'class-validator';

export class CurrentMotdResponseDto {
  motd: string | null;
}

export class MotdAuthorDto {
  username: string;

  avatar_url: string;

  id: string;
}

export class MotdDto {
  id: number;

  content: string;

  user: MotdAuthorDto;
}

export class CreateMotdDto {
  @IsString()
  @MaxLength(255)
  content: string;
}

export class AddMotdResponseDto {
  id: number;

  content: string;

  balance_after: string;
}
