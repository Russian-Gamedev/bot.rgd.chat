import { Expose, Type } from 'class-transformer';
import { Permission } from '#core/permissions/permissions.types';
import { PublicUserProfileDto } from './public-user-profile.dto';

export class ActorPermissionsDto {
  @Expose()
  global: Permission[];

  @Expose()
  guilds: Record<string, Permission[]>;
}

export class CurrentUserProfileDto extends PublicUserProfileDto {
  @Expose()
  @Type(() => ActorPermissionsDto)
  permissions: ActorPermissionsDto;
}
