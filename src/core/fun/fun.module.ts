import { Module } from '@nestjs/common';
import { OpenAiModule } from '#common/openai/openai.module';
import { TarotCommand } from './commands/tarot/tarot.command';
import { FunService } from './fun.service';

@Module({
  imports: [OpenAiModule],
  providers: [FunService, TarotCommand],
})
export class FunModule {}
