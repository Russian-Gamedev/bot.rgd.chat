import { BadRequestException } from '@nestjs/common';

import { MiniGame } from './entities/mini-game-round.entity';

export class MiniGameAlreadyPlayingException extends BadRequestException {
  constructor(game: MiniGame) {
    super(`Пользователь уже играет в ${game}`);
  }
}
