import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UsersController } from './users.controller';
import { UserService } from './users.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([UserProfileEntity, MemberProfileEntity]),
    PermissionsModule,
  ],
  controllers: [UsersController],
  providers: [UserService, DiscordProfileSyncService],
  exports: [UserService, DiscordProfileSyncService],
})
export class UserModule {}
