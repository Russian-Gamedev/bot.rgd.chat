import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { GamesModule } from '#core/games/games.module';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { PublicProfileService } from './public-profile.service';
import { PublicProfileTagService } from './public-profile-tag.service';
import { UsersController } from './users.controller';
import { UserService } from './users.service';

@Module({
  imports: [
    GamesModule,
    MikroOrmModule.forFeature([
      UserProfileEntity,
      MemberProfileEntity,
      UserProfileTagEntity,
    ]),
    PermissionsModule,
  ],
  controllers: [UsersController],
  providers: [
    UserService,
    DiscordProfileSyncService,
    PublicProfileTagService,
    PublicProfileService,
  ],
  exports: [UserService, DiscordProfileSyncService],
})
export class UserModule {}
