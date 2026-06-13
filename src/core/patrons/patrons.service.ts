import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

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

@Injectable()
export class PatronsService {
  constructor(
    @InjectRepository(PatronEntity)
    private readonly patronsRepository: EntityRepository<PatronEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly usersRepository: EntityRepository<UserProfileEntity>,
    private readonly em: EntityManager,
  ) {}

  async getPatrons(): Promise<PatronDto[]> {
    const patrons = await this.patronsRepository.findAll({
      orderBy: { value: 'DESC' },
    });
    const userIds = patrons.map((patron) => BigInt(patron.user_id));
    const users = await this.usersRepository.find({
      user_id: { $in: userIds },
    });
    const usersById = new Map(
      users.map((user) => [user.user_id.toString(), user]),
    );

    return patrons.map((patron) => {
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
  }

  async addPatronValue(
    userId: DiscordID,
    value: number,
  ): Promise<PatronEntity> {
    return this.em.transactional(async (em) => {
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
  }
}
