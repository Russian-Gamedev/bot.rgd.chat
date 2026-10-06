import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { MiniGamesCommand } from './commands/minigames.command';
import { MiniGameRoundEntity } from './entities/mini-game-round.entity';
import { FlipGame } from './games/flip/flip.game';
import { RouletteGame } from './games/roulette/roulette.game';
import { SlotGame } from './games/slot/slot.game';
import { MiniGameService } from './mini-game.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([MiniGameRoundEntity]),
    UserModule,
    WalletModule,
  ],
  providers: [
    MiniGameService,
    MiniGamesCommand,
    FlipGame,
    SlotGame,
    RouletteGame,
  ],
  exports: [MiniGameService],
})
export class MiniGamesModule {}
