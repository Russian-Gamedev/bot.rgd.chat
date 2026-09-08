import { Injectable, Logger } from '@nestjs/common';
import { Context, type ContextOf, On } from 'necord';

import { UtilsService } from './utils.service';

@Injectable()
export class UtilsWatcher {
  private readonly logger = new Logger(UtilsWatcher.name);

  constructor(private readonly utilsService: UtilsService) {}

  @On('messageCreate')
  async onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>) {
    try {
      await this.utilsService.handleMessage(message);
    } catch (error) {
      this.logger.error('Failed to fix message links:', error);
    }
  }
}
