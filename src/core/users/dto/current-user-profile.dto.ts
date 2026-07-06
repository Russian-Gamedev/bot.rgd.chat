import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { Permission } from '#core/permissions/permissions.types';
import { PublicUserProfileDto } from './public-user-profile.dto';

export class ActorPermissionsDto {
  @Expose()
  @ApiProperty({ enum: Object.values(Permission), isArray: true })
  global: Permission[];

  @Expose()
  @ApiProperty({
    additionalProperties: {
      type: 'array',
      items: { enum: Object.values(Permission), type: 'string' },
    },
    description: 'Permissions grouped by Discord Guild ID.',
    type: 'object',
  })
  guilds: Record<string, Permission[]>;
}

export class CurrentUserProfileDto extends PublicUserProfileDto {
  @Expose()
  @ApiProperty({ type: ActorPermissionsDto })
  @Type(() => ActorPermissionsDto)
  permissions: ActorPermissionsDto;
}
