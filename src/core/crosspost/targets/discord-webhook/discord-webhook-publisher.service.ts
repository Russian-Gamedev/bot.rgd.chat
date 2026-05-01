import { Injectable } from '@nestjs/common';

import type {
  CrossPostEvent,
  DiscordWebhookMessageResponse,
} from '../../types/crosspost.types';

@Injectable()
export class DiscordWebhookPublisher {
  async createMessage(webhookUrl: string, event: CrossPostEvent) {
    const response = await fetch(this.withWait(webhookUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildPayload(event)),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook create failed: ${response.status}`);
    }

    return response.json() as Promise<DiscordWebhookMessageResponse>;
  }

  async editMessage(
    webhookUrl: string,
    messageId: string,
    event: CrossPostEvent,
  ) {
    const response = await fetch(this.messageUrl(webhookUrl, messageId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildPayload(event)),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook edit failed: ${response.status}`);
    }
  }

  async deleteMessage(webhookUrl: string, messageId: string) {
    const response = await fetch(this.messageUrl(webhookUrl, messageId), {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Discord webhook delete failed: ${response.status}`);
    }
  }

  private buildPayload(event: CrossPostEvent) {
    return {
      content: this.buildContent(event),
      username: event.authorName,
      avatar_url: event.authorAvatarUrl ?? undefined,
      allowed_mentions: { parse: [] },
    };
  }

  private buildContent(event: CrossPostEvent) {
    const parts = [event.text.trim(), ...event.attachmentUrls].filter(Boolean);
    const content = parts.join('\n');

    if (content.length <= 2000) return content;
    return content.slice(0, 1997) + '...';
  }

  private withWait(webhookUrl: string) {
    const url = new URL(webhookUrl);
    url.searchParams.set('wait', 'true');
    return url.toString();
  }

  private messageUrl(webhookUrl: string, messageId: string) {
    const url = new URL(webhookUrl);
    url.search = '';
    url.pathname = `${url.pathname}/messages/${messageId}`;
    return url.toString();
  }
}
