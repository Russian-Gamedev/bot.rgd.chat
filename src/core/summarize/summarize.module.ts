import { Module } from '@nestjs/common';

import { OpenAiModule } from '#common/openai/openai.module';
import { SummarizeCommand } from './commands/summarize.command';
import { SummarizeMessageCommand } from './commands/summarize-message.command';
import { SummarizeService } from './summarize.service';

@Module({
  imports: [OpenAiModule],
  providers: [SummarizeCommand, SummarizeMessageCommand, SummarizeService],
})
export class SummarizeModule {}
