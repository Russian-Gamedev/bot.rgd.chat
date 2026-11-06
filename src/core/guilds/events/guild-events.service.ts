import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { GuildEvents } from '#config/guilds';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { pickRandom, pickWeighted } from '#lib/utils';

import { GuildEventEntity } from './entities/events.entity';
import { GUILD_EVENT_PICK_SMOOTHING } from './guild-events.constants';

export interface EventAuthorView {
  id: string;
  username: string;
  avatar_url: string;
}

export interface GuildEventView {
  id: string;
  event: GuildEvents;
  message: string;
  attachments: string[] | null;
  triggered_count: number;
  author: EventAuthorView;
}

export interface GuildEventListView extends GuildEventView {
  /** Chance the weighted lottery in getRandom picks this template next. */
  probability: number;
}

@Injectable()
export class GuildEventService {
  constructor(
    @InjectRepository(GuildEventEntity)
    private readonly guildEventRepository: EntityRepository<GuildEventEntity>,
    private readonly entityManager: EntityManager,
  ) {}

  async getRandom(event: GuildEvents, params: Record<string, string> = {}) {
    const events = await this.guildEventRepository.find({ event });
    if (!events.length) return null;

    // Weighted lottery over the event's template pool.
    const template = pickWeighted(events, GuildEventService.pickWeight);

    template.triggered_count++;
    await this.entityManager.persist(template).flush();

    return GuildEventService.buildTemplate(template, params);
  }

  async addEvent(
    event: GuildEvents,
    message: string,
    attachments: string[] | null,
    authorId?: bigint,
  ): Promise<GuildEventView> {
    const newEvent = new GuildEventEntity();
    newEvent.event = event;
    newEvent.message = message;
    newEvent.attachments = attachments;
    newEvent.author_id = authorId;

    await this.entityManager.persist(newEvent).flush();
    const [view] = await this.enrichAuthors([newEvent]);
    return view;
  }

  async updateEvent(
    id: string,
    data: { message?: string; attachments?: string[] | null },
    authorId: bigint,
  ): Promise<GuildEventView | null> {
    const event = await this.guildEventRepository.findOne({
      id,
      author_id: authorId,
    });
    if (!event) return null;

    if (data.message !== undefined) {
      event.message = data.message;
    }
    if (data.attachments !== undefined) {
      event.attachments = data.attachments;
    }

    await this.entityManager.persist(event).flush();
    const [view] = await this.enrichAuthors([event]);
    return view;
  }

  async removeEvent(id: string, authorId: bigint) {
    const event = await this.guildEventRepository.findOne({
      id,
      author_id: authorId,
    });
    if (!event) return false;

    await this.entityManager.remove(event).flush();
    return true;
  }

  async listEvents(event?: GuildEvents): Promise<GuildEventListView[]> {
    const events = await this.guildEventRepository.find(
      event ? { event } : {},
      {
        orderBy: { createdAt: 'DESC' },
      },
    );
    const views = await this.enrichAuthors(events);

    // Weight sums are kept per event pool so every probability shares the
    // same normalized lottery as getRandom.
    const weightSum = new Map<GuildEvents, number>();
    for (const view of views) {
      weightSum.set(
        view.event,
        (weightSum.get(view.event) ?? 0) + GuildEventService.pickWeight(view),
      );
    }

    return views.map((view) => ({
      ...view,
      probability:
        GuildEventService.pickWeight(view) / weightSum.get(view.event)!,
    }));
  }

  private async enrichAuthors(
    events: GuildEventEntity[],
  ): Promise<GuildEventView[]> {
    const userIds = [
      ...new Set(events.filter((e) => e.author_id).map((e) => e.author_id!)),
    ];

    const users =
      userIds.length > 0
        ? await this.entityManager.find(UserProfileEntity, {
            user_id: { $in: userIds },
          })
        : [];
    const usersById = new Map(users.map((u) => [u.user_id.toString(), u]));

    return events.map((event) => {
      const authorId = event.author_id?.toString();
      const user = authorId ? usersById.get(authorId) : undefined;

      return {
        id: event.id,
        event: event.event,
        message: event.message,
        attachments: event.attachments,
        triggered_count: event.triggered_count,
        author: {
          id: authorId ?? '',
          username: user?.username ?? 'Unknown',
          avatar_url: user?.avatar_url ?? '',
        },
      };
    });
  }

  /**
   * Weight in the template lottery: less-picked templates are proportionally
   * more likely, smoothing keeps brand-new (count 0) ones from dominating.
   */
  private static pickWeight({ triggered_count }: { triggered_count: number }) {
    return 1 / (triggered_count + GUILD_EVENT_PICK_SMOOTHING);
  }

  static buildTemplate(
    template: GuildEventEntity,
    params: Record<string, string>,
  ) {
    const names = Object.keys(params);
    const values = Object.values(params);

    let message = template.message.replace(/\$\{(\w+)\}/g, (match, p1) => {
      const index = names.indexOf(p1);
      return index !== -1 ? values[index] : match;
    });

    const attachment = pickRandom(template.attachments ?? []);
    if (attachment) {
      message += `\n${attachment}`;
    }
    return message;
  }

  static validateTemplate(template: string, requiredParams: string[]) {
    const regex = /\$\{(\w+)\}/g;
    const matches = template.matchAll(regex);
    const missingParams: string[] = [];

    const presentParams = new Set<string>();
    for (const match of matches) {
      presentParams.add(match[1]);
    }

    for (const param of requiredParams) {
      if (!presentParams.has(param)) {
        missingParams.push(param);
      }
    }

    return missingParams;
  }
}
