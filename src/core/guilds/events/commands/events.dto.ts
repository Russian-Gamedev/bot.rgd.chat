import { BooleanOption, StringOption } from 'necord';

import { GuildEvents } from '#config/guilds';

export class FakeEventDto {
  @StringOption({
    name: 'event',
    required: true,
    description: 'The event to trigger',
    choices: Object.values(GuildEvents).map((event) => ({
      name: event,
      value: event,
    })),
  })
  event: GuildEvents;

  @BooleanOption({
    name: 'silent',
    required: false,
    description: 'Whether to send the event message silently',
  })
  silent: boolean;
}

export class AddEventDto {
  @StringOption({
    name: 'event',
    required: true,
    description: 'The event type to add a template for',
    choices: Object.values(GuildEvents).map((event) => ({
      name: event,
      value: event,
    })),
  })
  event: GuildEvents;

  @StringOption({
    name: 'template',
    required: true,
    description: 'The event message template',
  })
  template: string;

  @StringOption({
    name: 'attachment_url',
    required: false,
    description: 'The URL of an attachment for the event message',
  })
  attachmentUrl?: string;
}
