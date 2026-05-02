import { Injectable } from '@nestjs/common';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';

import { AppLifecycleService } from '#common/app-lifecycle.service';
import { GitInfoService } from '#common/git-info.service';

import { buildGitInfoEmbed } from './git-info.embed';

@Injectable()
export class GitInfoCommands {
  constructor(
    private readonly gitInfoService: GitInfoService,
    private readonly appLifecycleService: AppLifecycleService,
  ) {}

  @SlashCommand({
    name: 'version',
    description: 'Show bot version and git information',
  })
  public async onVersion(@Context() [interaction]: SlashCommandContext) {
    const embed = await this.getEmbed();
    return interaction.reply({ embeds: [embed] });
  }

  private async getEmbed() {
    const gitInfo = this.gitInfoService.getGitInfo();
    const startupContext = await this.appLifecycleService.getStartupContext();
    return buildGitInfoEmbed(gitInfo, startupContext);
  }
}
