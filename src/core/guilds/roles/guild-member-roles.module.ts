import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { GuildMemberRoleEntity } from './entities/guild-member-role.entity';
import { GuildMemberRolesService } from './guild-member-roles.service';

@Module({
  imports: [MikroOrmModule.forFeature([GuildMemberRoleEntity])],
  providers: [GuildMemberRolesService],
  exports: [GuildMemberRolesService],
})
export class GuildMemberRolesModule {}
