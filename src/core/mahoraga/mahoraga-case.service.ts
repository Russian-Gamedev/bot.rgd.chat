import type { FilterQuery } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';

import { isDiscordId } from '#lib/utils';

import { MahoragaListQueryDto } from './dto/mahoraga.dto';
import { MahoragaCaseEntity } from './entities/mahoraga-case.entity';
import {
  MahoragaCaseStatus,
  MahoragaEvidence,
  MahoragaReason,
  MahoragaRegisterCaseInput,
  MahoragaRegisterCaseResult,
} from './mahoraga.types';

const MAX_EVIDENCE_ITEMS = 50;

@Injectable()
export class MahoragaCaseService {
  constructor(
    @InjectRepository(MahoragaCaseEntity)
    private readonly casesRepository: EntityRepository<MahoragaCaseEntity>,
    private readonly em: EntityManager,
  ) {}

  async listCases(query: MahoragaListQueryDto): Promise<MahoragaCaseEntity[]> {
    const where: FilterQuery<MahoragaCaseEntity> = {};
    if (query.status) where.status = query.status;
    if (query.reason) where.reason = query.reason;
    if (query.guild_id)
      where.source_guild_id = this.parseDiscordId(query.guild_id);

    return this.casesRepository.find(where, {
      limit: query.limit,
      offset: query.offset,
      orderBy: { last_detected_at: 'DESC' },
    });
  }

  async getCaseByUserId(userId: string): Promise<MahoragaCaseEntity> {
    const user_id = this.parseDiscordId(userId);
    const mahoragaCase = await this.casesRepository.findOne({ user_id });
    if (!mahoragaCase) throw new NotFoundException('Mahoraga case not found');
    return mahoragaCase;
  }

  async getCaseByVerificationToken(
    token: string,
  ): Promise<MahoragaCaseEntity | null> {
    return this.casesRepository.findOne({ verification_token: token });
  }

  async getActiveCaseByUserId(
    userId: string,
  ): Promise<MahoragaCaseEntity | null> {
    const user_id = this.parseDiscordId(userId);
    return this.casesRepository.findOne({
      user_id,
      status: {
        $in: [
          MahoragaCaseStatus.Active,
          MahoragaCaseStatus.PendingVerification,
        ],
      },
    });
  }

  async getExpiredVerificationCases(): Promise<MahoragaCaseEntity[]> {
    return this.casesRepository.find({
      status: MahoragaCaseStatus.PendingVerification,
      verification_expires_at: { $lte: new Date() },
    });
  }

  async registerCase(
    input: MahoragaRegisterCaseInput,
  ): Promise<MahoragaRegisterCaseResult> {
    const user_id = this.parseDiscordId(input.userId);
    const now = new Date();
    let mahoragaCase = await this.casesRepository.findOne({ user_id });
    const previousStatus = mahoragaCase?.status ?? null;
    const shouldApplySoftban =
      input.status !== MahoragaCaseStatus.Observed &&
      (!mahoragaCase ||
        mahoragaCase.status === MahoragaCaseStatus.Pardoned ||
        mahoragaCase.status === MahoragaCaseStatus.Observed);
    const shouldSendVerification =
      shouldApplySoftban &&
      input.status === MahoragaCaseStatus.PendingVerification;

    if (!mahoragaCase) {
      mahoragaCase = new MahoragaCaseEntity();
      mahoragaCase.user_id = user_id;
      mahoragaCase.detected_at = now;
    }

    const nextStatus = this.resolveNextStatus(previousStatus, input.status);
    mahoragaCase.status = nextStatus;
    mahoragaCase.reason = input.reason;
    mahoragaCase.source_guild_id = input.evidence.guildId
      ? this.parseDiscordId(input.evidence.guildId)
      : mahoragaCase.source_guild_id;
    mahoragaCase.source_channel_id = input.evidence.channelId
      ? this.parseDiscordId(input.evidence.channelId)
      : mahoragaCase.source_channel_id;
    mahoragaCase.source_message_id = input.evidence.messageId
      ? this.parseDiscordId(input.evidence.messageId)
      : mahoragaCase.source_message_id;
    mahoragaCase.matched_value =
      input.evidence.matchedValue ?? mahoragaCase.matched_value;
    mahoragaCase.evidence = this.appendEvidence(
      mahoragaCase.evidence,
      input.evidence,
    );
    mahoragaCase.detection_count += 1;
    mahoragaCase.last_detected_at = now;

    if (
      nextStatus === MahoragaCaseStatus.PendingVerification &&
      shouldSendVerification
    ) {
      mahoragaCase.verification_token ??= this.createVerificationToken();
      mahoragaCase.verification_expires_at = new Date(
        now.getTime() + (input.verificationTimeoutMinutes ?? 30) * 60_000,
      );
    } else if (nextStatus !== MahoragaCaseStatus.PendingVerification) {
      mahoragaCase.verification_token = null;
      mahoragaCase.verification_expires_at = null;
    }

    if (
      previousStatus === MahoragaCaseStatus.Pardoned &&
      nextStatus !== MahoragaCaseStatus.Pardoned
    ) {
      mahoragaCase.pardoned_at = null;
      mahoragaCase.pardoned_by = null;
      mahoragaCase.pardon_reason = null;
    }

    await this.save(mahoragaCase);
    return { case: mahoragaCase, shouldApplySoftban, shouldSendVerification };
  }

  async pardonCase(
    userId: string,
    actorId?: string,
    reason?: string,
  ): Promise<MahoragaCaseEntity> {
    const mahoragaCase = await this.getCaseByUserId(userId);
    const now = new Date();

    mahoragaCase.status = MahoragaCaseStatus.Pardoned;
    mahoragaCase.verification_token = null;
    mahoragaCase.verification_expires_at = null;
    mahoragaCase.pardoned_at = now;
    mahoragaCase.pardoned_by = actorId ? this.parseDiscordId(actorId) : null;
    mahoragaCase.pardon_reason = reason ?? null;
    mahoragaCase.evidence = this.appendEvidence(mahoragaCase.evidence, {
      reason: MahoragaReason.Manual,
      actorId,
      note: reason ?? 'pardoned',
      createdAt: now.toISOString(),
    });

    await this.save(mahoragaCase);
    return mahoragaCase;
  }

  async activatePendingCase(
    mahoragaCase: MahoragaCaseEntity,
  ): Promise<MahoragaCaseEntity> {
    mahoragaCase.status = MahoragaCaseStatus.Active;
    mahoragaCase.verification_token = null;
    mahoragaCase.verification_expires_at = null;
    await this.save(mahoragaCase);
    return mahoragaCase;
  }

  parseDiscordId(value: string): bigint {
    if (!isDiscordId(value)) {
      throw new BadRequestException(`Invalid Discord ID: ${value}`);
    }
    return BigInt(value);
  }

  private async save(mahoragaCase: MahoragaCaseEntity): Promise<void> {
    await this.em.persist(mahoragaCase).flush();
  }

  private resolveNextStatus(
    currentStatus: MahoragaCaseStatus | null,
    requested: MahoragaCaseStatus,
  ): MahoragaCaseStatus {
    if (
      requested === MahoragaCaseStatus.Observed &&
      (currentStatus === MahoragaCaseStatus.Active ||
        currentStatus === MahoragaCaseStatus.PendingVerification)
    ) {
      return currentStatus;
    }

    return requested;
  }

  private appendEvidence(
    current: MahoragaEvidence[],
    evidence: MahoragaEvidence,
  ): MahoragaEvidence[] {
    return [...current, evidence].slice(-MAX_EVIDENCE_ITEMS);
  }

  private createVerificationToken(): string {
    return randomBytes(16).toString('hex');
  }
}
