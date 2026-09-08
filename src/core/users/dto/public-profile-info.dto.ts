import { Expose, Type } from 'class-transformer';

export class PublicUserProfileLinkDto {
  @Expose()
  label: string;

  @Expose()
  icon: string;

  @Expose()
  url: string;
}

export class PublicUserProfileInfoDto {
  @Expose()
  about: string | null;

  @Expose()
  @Type(() => PublicUserProfileLinkDto)
  links: PublicUserProfileLinkDto[];
}
