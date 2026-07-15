import { Module } from '@nestjs/common';
import { OpenAiModule } from '#common/openai/openai.module';
import { TarotCommand } from './commands/tarot/tarot.command';
import { VryadliCommand } from './commands/vraydly.command';
import { FunService } from './fun.service';

@Module({
  imports: [OpenAiModule],
  providers: [VryadliCommand, FunService, TarotCommand],
})
export class FunModule {}
