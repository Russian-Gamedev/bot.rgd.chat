import { Module } from '@nestjs/common';

import { GuildMemberRolesModule } from '#core/guilds/roles/guild-member-roles.module';
import { GuildSettingsModule } from '#core/guilds/settings/guild-settings.module';
import { UserModule } from '#core/users/users.module';
import { BirthdayService } from './birthday.service';
import { BirthdayCommands } from './commands/birthday.command';

@Module({
  imports: [GuildMemberRolesModule, GuildSettingsModule, UserModule],
  providers: [BirthdayService, BirthdayCommands],
})
export class BirthdayModule {}
