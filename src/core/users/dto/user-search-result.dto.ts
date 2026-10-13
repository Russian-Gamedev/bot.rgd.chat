import { Expose } from 'class-transformer';

export class UserSearchResultDto {
  @Expose()
  id: string;

  @Expose()
  username: string;

  @Expose()
  nickname: string | null;

  @Expose()
  avatarUrl: string;
}
