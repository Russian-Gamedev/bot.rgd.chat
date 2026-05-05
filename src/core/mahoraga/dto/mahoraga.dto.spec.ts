import { describe, expect, it } from 'bun:test';

import { MahoragaCaseEntity } from '../entities/mahoraga-case.entity';
import { MahoragaCaseStatus, MahoragaReason } from '../mahoraga.types';

import { MahoragaCaseResponseDto } from './mahoraga.dto';

describe('MahoragaCaseResponseDto', () => {
  it('serializes Discord IDs as strings and keeps case fields', () => {
    const mahoragaCase = new MahoragaCaseEntity();
    mahoragaCase.id = 'case-id';
    mahoragaCase.user_id = 111111111111111111n;
    mahoragaCase.status = MahoragaCaseStatus.Observed;
    mahoragaCase.reason = MahoragaReason.LinkRepeat;
    mahoragaCase.source_guild_id = 222222222222222222n;
    mahoragaCase.source_channel_id = 333333333333333333n;
    mahoragaCase.source_message_id = 444444444444444444n;
    mahoragaCase.matched_value = 'example.com/spam';
    mahoragaCase.evidence = [
      {
        reason: MahoragaReason.LinkRepeat,
        guildId: '222222222222222222',
        url: 'example.com/spam',
        createdAt: '2026-05-05T00:00:00.000Z',
      },
    ];
    mahoragaCase.detection_count = 7;
    mahoragaCase.detected_at = new Date('2026-05-05T01:00:00.000Z');
    mahoragaCase.last_detected_at = new Date('2026-05-05T02:00:00.000Z');
    mahoragaCase.pardoned_by = 555555555555555555n;
    mahoragaCase.pardon_reason = 'manual review';
    mahoragaCase.createdAt = new Date('2026-05-05T03:00:00.000Z');
    mahoragaCase.updatedAt = new Date('2026-05-05T04:00:00.000Z');

    const dto = MahoragaCaseResponseDto.fromEntity(mahoragaCase);

    expect(dto.user_id).toBe('111111111111111111');
    expect(dto.source_guild_id).toBe('222222222222222222');
    expect(dto.source_channel_id).toBe('333333333333333333');
    expect(dto.source_message_id).toBe('444444444444444444');
    expect(dto.pardoned_by).toBe('555555555555555555');
    expect(dto.status).toBe(MahoragaCaseStatus.Observed);
    expect(dto.reason).toBe(MahoragaReason.LinkRepeat);
    expect(dto.matched_value).toBe('example.com/spam');
    expect(dto.evidence).toEqual(mahoragaCase.evidence);
    expect(dto.detection_count).toBe(7);
    expect(dto.pardon_reason).toBe('manual review');
  });
});
