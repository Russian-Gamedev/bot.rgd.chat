import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PatronEntity } from '#core/patrons/entities/patron.entity';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { UsersController } from './users.controller';
import { UserService } from './users.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      UserProfileEntity,
      MemberProfileEntity,
      PatronEntity,
      UserProfileTagEntity,
    ]),
    PermissionsModule,
  ],
  controllers: [UsersController],
  providers: [UserService, DiscordProfileSyncService],
  exports: [UserService, DiscordProfileSyncService],
})
export class UserModule {}
