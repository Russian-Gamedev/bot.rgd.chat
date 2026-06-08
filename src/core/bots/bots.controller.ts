import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BotTarget } from './bots.decorator';
import { BotApiGuard } from './bots.guard';
import { BotsService } from './bots.service';
import { BotEntity } from './entities/bot.entity';

@Controller('bots')
@UseGuards(BotApiGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class BotsController {
  constructor(readonly _botsService: BotsService) {}

  @Get('me')
  getMe(@BotTarget() bot: BotEntity) {
    return bot;
  }
}
