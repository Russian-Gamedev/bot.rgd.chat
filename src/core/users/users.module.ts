import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserRefreshService } from './user-refresh.service';
import { UsersController } from './users.controller';
import { UserService } from './users.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([UserProfileEntity, MemberProfileEntity]),
    PermissionsModule,
  ],
  controllers: [UsersController],
  providers: [UserService, UserRefreshService],
  exports: [UserService],
})
export class UserModule {}
