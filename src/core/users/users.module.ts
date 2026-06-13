import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserRefreshService } from './user-refresh.service';
import { UserService } from './users.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([UserProfileEntity, MemberProfileEntity]),
  ],
  providers: [UserService, UserRefreshService],
  exports: [UserService],
})
export class UserModule {}
