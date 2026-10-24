import { Injectable, Logger } from '@nestjs/common';
import type { Message } from 'discord.js';

import {
  applyFixableLinks,
  type FixableLink,
  findFixableLinks,
} from './link-fix';
import { detectEmbedMediaKind, type EmbedMediaKind } from './video-embed';

const EMBED_CACHE_TTL_MS = 60 * 60 * 1000;
const EMBED_CACHE_MAX_SIZE = 1000;

type ResolvedEmbedKind = Exclude<EmbedMediaKind, 'unknown'>;

interface CachedEmbedKind {
  kind: ResolvedEmbedKind;
  expiresAt: number;
}

export interface VideoEmbedFixes {
  links: FixableLink[];
  content: string;
}

@Injectable()
export class UtilsService {
  private readonly logger = new Logger(UtilsService.name);
  private readonly embedKinds = new Map<string, CachedEmbedKind>();
  private readonly pendingEmbeds = new Map<string, Promise<EmbedMediaKind>>();

  async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || message.webhookId || !message.content) return;

    const { links } = await this.fixVideoEmbeds(message.content);
    if (links.length === 0) return;

    await message.suppressEmbeds(true);
    await message.reply({
      content: links.map((link) => link.fixed).join('\n'),
      allowedMentions: { parse: [] },
    });
  }

  /** Finds fix-embed links that resolve to video and rewrites them in the content. */
  async fixVideoEmbeds(content: string): Promise<VideoEmbedFixes> {
    const candidates = findFixableLinks(content);
    if (candidates.length === 0) {
      return { links: [], content };
    }

    const kinds = await Promise.all(
      candidates.map((link) => this.getEmbedKind(link.fixed)),
    );
    const links = candidates.filter((_, index) => kinds[index] === 'video');

    return {
      links,
      content: links.length > 0 ? applyFixableLinks(content, links) : content,
    };
  }

  private async getEmbedKind(fixedUrl: string): Promise<EmbedMediaKind> {
    const key = cacheKey(fixedUrl);
    const cached = this.embedKinds.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.kind;
      this.embedKinds.delete(key);
    }

    const pending = this.pendingEmbeds.get(key);
    if (pending) return pending;

    const promise = detectEmbedMediaKind(fixedUrl)
      .then((kind) => {
        if (kind === 'unknown') {
          this.logger.debug(
            `Could not determine embed media type for ${fixedUrl}`,
          );
        } else {
          this.rememberKind(key, kind);
        }
        return kind;
      })
      .finally(() => {
        this.pendingEmbeds.delete(key);
      });

    this.pendingEmbeds.set(key, promise);
    return promise;
  }

  private rememberKind(key: string, kind: ResolvedEmbedKind): void {
    if (this.embedKinds.size >= EMBED_CACHE_MAX_SIZE) {
      const oldestKey = this.embedKinds.keys().next().value;
      if (oldestKey !== undefined) this.embedKinds.delete(oldestKey);
    }

    this.embedKinds.set(key, {
      kind,
      expiresAt: Date.now() + EMBED_CACHE_TTL_MS,
    });
  }
}

function cacheKey(fixedUrl: string): string {
  try {
    const url = new URL(fixedUrl);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return fixedUrl;
  }
}
