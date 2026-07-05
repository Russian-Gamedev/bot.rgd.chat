import { Module } from '@nestjs/common';

import { GuildSettingsModule } from '#core/guilds/settings/guild-settings.module';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { FlipGame } from './games/flip.game';
import { SlotGame } from './games/slot.game';

@Module({
  imports: [UserModule, WalletModule, GuildSettingsModule],
  providers: [FlipGame, SlotGame],
})
export class MiniGamesModule {}
