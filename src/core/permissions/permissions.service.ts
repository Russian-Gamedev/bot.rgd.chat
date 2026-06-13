import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '#core/auth/auth.type';
import { BotEntity } from '#core/bots/entities/bot.entity';
import { PermissionGrantEntity } from './entities/permission-grant.entity';
import type {
  AuthenticatedActor,
  PermissionContext,
} from './permissions.types';
import { ActorType, Permission } from './permissions.types';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(PermissionGrantEntity)
    private readonly grantsRepository: EntityRepository<PermissionGrantEntity>,
    @InjectRepository(BotEntity)
    private readonly botsRepository: EntityRepository<BotEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async authenticateToken(token: string): Promise<AuthenticatedActor | null> {
    if (token.includes(':')) {
      return this.authenticateBot(token);
    }

    return this.authenticateUser(token);
  }

  async hasPermission(
    actor: AuthenticatedActor,
    permission: Permission,
    context: PermissionContext = {},
  ): Promise<boolean> {
    if (this.hasImplicitPermission(actor, permission, context)) {
      return true;
    }

    if (actor.type === ActorType.Bot) {
      return actor.bot.permissions.includes(permission);
    }

    const where = {
      actorType: ActorType.User,
      actorId: BigInt(actor.id),
      permission,
    };

    const globalGrant = await this.grantsRepository.findOne({
      ...where,
      guild_id: null,
    });
    if (globalGrant) return true;

    if (!context.guildId) return false;

    const guildGrant = await this.grantsRepository.findOne({
      ...where,
      guild_id: BigInt(context.guildId),
    });

    return Boolean(guildGrant);
  }

  private async authenticateUser(
    token: string,
  ): Promise<AuthenticatedActor | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      return {
        type: ActorType.User,
        id: payload.user_id,
        username: payload.username,
      };
    } catch {
      return null;
    }
  }

  private async authenticateBot(
    token: string,
  ): Promise<AuthenticatedActor | null> {
    const [idStr, tokenStr] = token.split(':', 2);
    const id = Number.parseInt(idStr, 10);
    if (Number.isNaN(id) || !tokenStr) return null;

    const bot = await this.botsRepository.findOne({ id });
    if (!bot) return null;

    const isValid = await Bun.password.verify(
      tokenStr,
      bot.tokenHash,
      'bcrypt',
    );
    if (!isValid) return null;

    bot.lastUsedAt = new Date();

    return {
      type: ActorType.Bot,
      id: String(bot.id),
      bot,
    };
  }

  private hasImplicitPermission(
    actor: AuthenticatedActor,
    permission: Permission,
    context: PermissionContext,
  ) {
    if (actor.type !== ActorType.User) return false;

    if (permission === Permission.WalletReadOwn) {
      return (context.targetUserId ?? actor.id) === actor.id;
    }

    return false;
  }
}
