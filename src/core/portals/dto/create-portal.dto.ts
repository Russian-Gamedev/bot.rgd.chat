import type { Channel } from 'discord.js';
import { ChannelOption } from 'necord';

export class CreatePortalDto {
  @ChannelOption({
    name: 'target_channel',
    description: 'Целевой канал для связывания',
    required: true,
  })
  target_channel: Channel;
}
