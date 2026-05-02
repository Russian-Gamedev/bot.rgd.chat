import { Injectable } from '@nestjs/common';
import { Client } from 'discord.js';
import { Context, Once, SlashCommand, type SlashCommandContext } from 'necord';

import { AppLifecycleService } from '#common/app-lifecycle.service';
import { GitInfoService } from '#common/git-info.service';

import { buildGitInfoEmbed } from './git-info.embed';

@Injectable()
export class GitInfoCommands {
  constructor(
    private readonly gitInfoService: GitInfoService,
    private readonly appLifecycleService: AppLifecycleService,
    private readonly discord: Client,
  ) {}

  @SlashCommand({
    name: 'version',
    description: 'Show bot version and git information',
  })
  public async onVersion(@Context() [interaction]: SlashCommandContext) {
    const embed = await this.getEmbed();
    return interaction.reply({ embeds: [embed] });
  }

  @Once('clientReady')
  async onReady() {
    if (process.env.NODE_ENV === 'development') return;

    const embed = await this.getEmbed();

    /// TODO: send to config channel
    const channel = await this.discord.channels.fetch(
      process.env.DEBUG_CHANNEL_ID!,
    );
    if (channel?.isSendable()) {
      await channel.send({ embeds: [embed] });
    }
  }

  private async getEmbed() {
    const gitInfo = this.gitInfoService.getGitInfo();
    const startupContext = await this.appLifecycleService.getStartupContext();
    return buildGitInfoEmbed(gitInfo, startupContext);
  }
}
