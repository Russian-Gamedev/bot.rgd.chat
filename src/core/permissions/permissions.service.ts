import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentVariables } from '#config/env';
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
    private readonly configService: ConfigService<EnvironmentVariables>,
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

    if (actor.type === ActorType.User && this.inWhitelist(actor.id)) {
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

  async getActorPermissions(
    actor: AuthenticatedActor,
  ): Promise<{ global: Permission[]; guilds: Record<string, Permission[]> }> {
    if (actor.type === ActorType.Bot) {
      return { global: actor.bot.permissions, guilds: {} };
    }

    if (this.inWhitelist(actor.id)) {
      return { global: Object.values(Permission), guilds: {} };
    }

    const grants = await this.grantsRepository.find({
      actorType: ActorType.User,
      actorId: BigInt(actor.id),
    });

    const global: Permission[] = [];
    const guilds: Record<string, Permission[]> = {};

    for (const grant of grants) {
      if (grant.guild_id === null) {
        global.push(grant.permission);
      } else {
        const gid = grant.guild_id.toString();
        (guilds[gid] ??= []).push(grant.permission);
      }
    }

    return { global, guilds };
  }

  private inWhitelist(userId: string): boolean {
    const whitelist = this.configService.get<string[]>(
      'API_ACCESS_WHITELIST',
      [],
    );
    return whitelist.includes(userId);
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
