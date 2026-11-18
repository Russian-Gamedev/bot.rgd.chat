import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { GuildEvents, GuildEventsParameters } from '#config/guilds';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { pickRandom, pickWeighted } from '#lib/utils';
import { GuildSettingsService } from '../settings/guild-settings.service';
import { GuildEventEntity } from './entities/events.entity';
import { GUILD_EVENT_PICK_SMOOTHING } from './guild-events.constants';
import {
  describeTokenArity,
  PLACEHOLDER_REGEX,
  splitTokenBody,
  TEMPLATE_TOKEN_REGEX,
  TEMPLATE_TOKENS,
} from './guild-events.tokens';

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

/** Params passed to getRandom; `guildId` is render context, not a template value. */
export type RandomEventParams = Record<string, string> & { guildId?: string };

@Injectable()
export class GuildEventService {
  private readonly logger = new Logger(GuildEventService.name);

  constructor(
    @InjectRepository(GuildEventEntity)
    private readonly guildEventRepository: EntityRepository<GuildEventEntity>,
    private readonly entityManager: EntityManager,
    private readonly guildSettings: GuildSettingsService,
  ) {}

  async getRandom(event: GuildEvents, params: RandomEventParams = {}) {
    const events = await this.guildEventRepository.find({ event });
    if (!events.length) return null;

    // Weighted lottery over the event's template pool.
    const template = pickWeighted(events, GuildEventService.pickWeight);

    template.triggered_count++;
    await this.entityManager.persist(template).flush();

    const { guildId, ...templateParams } = params;
    if (guildId) {
      await this.resolveGuildTokens(template, templateParams, guildId);
    }

    return GuildEventService.buildTemplate(template, templateParams);
  }

  /** Pre-computes guild-dependent tokens (e.g. ${active}) into the params. */
  private async resolveGuildTokens(
    template: GuildEventEntity,
    params: Record<string, string>,
    guildId: string,
  ) {
    for (const [name, token] of Object.entries(TEMPLATE_TOKENS)) {
      if (!token.resolveGuild) continue;
      if (!template.message.includes(`\${${name}}`)) continue;

      const value = await token
        .resolveGuild(this.guildSettings, guildId)
        .catch((err: Error) => {
          this.logger.warn(
            `Failed to resolve \${${name}} in guild ${guildId}: ${err.message}`,
          );
          return null;
        });

      if (value == null) {
        this.logger.warn(
          `Unresolved \${${name}} in guild ${guildId}: no matching members`,
        );
        continue;
      }
      params[name] = value;
    }
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
      const problems = GuildEventService.validateTemplate(
        data.message,
        GuildEventsParameters[event.event],
      );
      if (problems.length) {
        throw new BadRequestException(
          `Invalid template: ${problems.join('; ')}`,
        );
      }
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
    let message = template.message.replace(
      TEMPLATE_TOKEN_REGEX,
      (match, body: string) => {
        const [name, ...args] = splitTokenBody(body);
        const token = TEMPLATE_TOKENS[name];

        if (
          token &&
          args.length >= token.minArgs &&
          args.length <= token.maxArgs
        ) {
          if (token.validateArgs?.(args)) return match;
          if (token.resolve) return token.resolve(args);
        }

        // Plain parameter, or a context token resolved earlier by getRandom.
        return args.length === 0 && name in params ? params[name]! : match;
      },
    );

    const attachment = pickRandom(template.attachments ?? []);
    if (attachment) {
      message += `\n${attachment}`;
    }
    return message;
  }

  /**
   * Validates placeholder syntax and required params; returns a list of
   * problems, empty when the template is fine.
   */
  static validateTemplate(template: string, requiredParams: string[]) {
    const problems: string[] = [];
    const presentParams = new Set<string>();

    for (const [, body] of template.matchAll(PLACEHOLDER_REGEX)) {
      const parts = splitTokenBody(body);
      const [name, ...args] = parts;

      if (parts.some((part) => part === '') || !/^\w+$/.test(name)) {
        problems.push(`malformed placeholder \${${body}}`);
        continue;
      }

      const token = TEMPLATE_TOKENS[name];
      if (token) {
        if (args.length < token.minArgs || args.length > token.maxArgs) {
          problems.push(`\${${name}} expects ${describeTokenArity(token)}`);
        } else {
          const error = token.validateArgs?.(args);
          if (error) problems.push(`\${${name}} ${error}`);
        }
        continue;
      }

      if (args.length > 0) {
        problems.push(`unknown token \${${name}}`);
        continue;
      }
      presentParams.add(name);
    }

    for (const param of requiredParams) {
      if (!presentParams.has(param)) {
        problems.push(`missing parameter ${param}`);
      }
    }

    return problems;
  }
}
