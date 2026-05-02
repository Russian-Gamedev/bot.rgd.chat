import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Client } from 'discord.js';
import { Once } from 'necord';

import { AppLifecycleService } from '#common/app-lifecycle.service';
import { GitInfoService } from '#common/git-info.service';
import { Environment } from '#config/env';

import { buildGitInfoEmbed } from './commands/git-info.embed';

@Injectable()
export class StartupNotifierService implements OnModuleInit {
  private readonly logger = new Logger(StartupNotifierService.name);

  constructor(
    private readonly discord: Client,
    private readonly gitInfoService: GitInfoService,
    private readonly appLifecycleService: AppLifecycleService,
  ) {}

  onModuleInit() {
    this.logger.log(
      `Startup notifier initialized: NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}, DEBUG_CHANNEL_ID=${this.getDebugChannelIdForLogs()}`,
    );
  }

  @Once('clientReady')
  async onReady() {
    this.logger.log(
      `Startup notifier clientReady: NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}, DEBUG_CHANNEL_ID=${this.getDebugChannelIdForLogs()}`,
    );

    if (process.env.NODE_ENV === Environment.Development) {
      this.logger.log('Skipping startup notification in development mode');
      return;
    }

    const debugChannelId = process.env.DEBUG_CHANNEL_ID?.trim();
    if (!debugChannelId) {
      this.logger.warn(
        'DEBUG_CHANNEL_ID is not configured, skipping startup notification',
      );
      return;
    }

    const embed = await this.getEmbed();

    try {
      const channel = await this.discord.channels.fetch(debugChannelId);
      if (!channel) {
        this.logger.warn(
          `Startup notification channel ${debugChannelId} was not found`,
        );
        return;
      }

      if (!channel.isSendable()) {
        this.logger.warn(
          `Startup notification channel ${debugChannelId} is not sendable (type=${String(channel.type)})`,
        );
        return;
      }

      await channel.send({ embeds: [embed] });
      this.logger.log(
        `Startup notification sent to Discord channel ${debugChannelId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send startup notification to channel ${debugChannelId}: ${String(error)}`,
      );
    }
  }

  private async getEmbed() {
    const gitInfo = this.gitInfoService.getGitInfo();
    const startupContext = await this.appLifecycleService.getStartupContext();
    return buildGitInfoEmbed(gitInfo, startupContext);
  }

  private getDebugChannelIdForLogs() {
    const channelId = process.env.DEBUG_CHANNEL_ID?.trim();
    return (channelId === '' ? undefined : channelId) ?? 'missing';
  }
}
