import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { DiscordProfileSyncService } from '#core/users/discord-profile-sync.service';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { type DiscordID } from '#root/lib/types';
import { PatronEntity } from './entities/patron.entity';
import { PatronHistoryEntity } from './entities/patron-history.entity';

export interface PatronDto {
  user: {
    id: string;
    username: string;
    avatar_url: string;
    banner: string;
  };
  value: number;
}

const PATRONS_CACHE_KEY = 'patrons:list:v1';
const PATRONS_CACHE_TTL_SECONDS = 60 * 60;

@Injectable()
export class PatronsService {
  constructor(
    @InjectRepository(PatronEntity)
    private readonly patronsRepository: EntityRepository<PatronEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly usersRepository: EntityRepository<UserProfileEntity>,
    private readonly em: EntityManager,
    private readonly redis: Redis,
    private readonly discordProfileSync: DiscordProfileSyncService,
  ) {}

  async getPatrons(): Promise<PatronDto[]> {
    const cached = await this.redis.get(PATRONS_CACHE_KEY);
    if (cached) {
      const parsed = await this.parseCachedPatrons(cached);
      if (parsed) return parsed;
    }

    const patrons = await this.patronsRepository.findAll({
      orderBy: { value: 'DESC' },
    });
    const userIds = patrons.map((patron) => BigInt(patron.user_id));

    await this.discordProfileSync.syncUsersById(userIds);

    const users = await this.usersRepository.find({
      user_id: { $in: userIds },
    });
    const usersById = new Map(
      users.map((user) => [user.user_id.toString(), user]),
    );

    const response = patrons.map((patron) => {
      const id = patron.user_id.toString();
      const user = usersById.get(id);

      return {
        user: {
          id,
          username: user?.username ?? '',
          avatar_url: user?.avatar_url ?? '',
          banner: user?.banner_alt ?? user?.banner ?? user?.banner_color ?? '',
        },
        value: patron.value,
      };
    });

    await this.redis.set(
      PATRONS_CACHE_KEY,
      JSON.stringify(response),
      'EX',
      PATRONS_CACHE_TTL_SECONDS,
    );

    return response;
  }

  async addPatronValue(
    userId: DiscordID,
    value: number,
  ): Promise<PatronEntity> {
    const patron = await this.em.transactional(async (em) => {
      const user_id = BigInt(userId);
      let patron = await em.findOne(PatronEntity, { user_id });

      if (!patron) {
        patron = new PatronEntity();
        patron.user_id = user_id;
        patron.value = 0;
      }

      const history = new PatronHistoryEntity();
      history.user_id = user_id;
      history.value = value;

      patron.value += value;

      em.persist(patron);
      em.persist(history);
      await em.flush();

      return patron;
    });

    await this.invalidatePatronsCache();

    return patron;
  }

  async invalidatePatronsCache(): Promise<void> {
    await this.redis.del(PATRONS_CACHE_KEY);
  }

  private async parseCachedPatrons(
    cached: string,
  ): Promise<PatronDto[] | null> {
    try {
      return JSON.parse(cached) as PatronDto[];
    } catch {
      await this.invalidatePatronsCache();
      return null;
    }
  }
}
