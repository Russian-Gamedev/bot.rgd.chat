import { Injectable, Logger } from '@nestjs/common';
import { Context, type ContextOf, On } from 'necord';

import { MahoragaService } from './mahoraga.service';

@Injectable()
export class MahoragaWatcher {
  private readonly logger = new Logger(MahoragaWatcher.name);

  constructor(private readonly mahoragaService: MahoragaService) {}

  @On('messageCreate')
  async onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>) {
    try {
      await this.mahoragaService.inspectMessage(message);
    } catch (error) {
      this.logger.error('Failed to inspect message for spam:', error);
    }
  }

  @On('guildMemberAdd')
  async onGuildMemberAdd(@Context() [member]: ContextOf<'guildMemberAdd'>) {
    try {
      await this.mahoragaService.handleMemberJoin(member);
    } catch (error) {
      this.logger.error('Failed to inspect Mahoraga member join:', error);
    }
  }
}
