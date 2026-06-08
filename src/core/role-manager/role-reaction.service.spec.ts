import { beforeEach, describe, expect, it } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/core';

import { RoleReactionEntity } from './entities/role-reaction.entity';
import { RoleReactionService } from './role-reaction.service';

describe('Role reaction', () => {
  let service: RoleReactionService;

  beforeEach(() => {
    const repo = {} as EntityRepository<RoleReactionEntity>;
    const em = {} as EntityManager;
    service = new RoleReactionService(repo, em);
  });

  it('parses custom emoji mappings', () => {
    const input = '<:smile:12345678901234567> <@&76543210987654321>';
    const res = service.parseMessage(input);
    expect(Object.keys(res).length).toBe(1);
    expect(res['12345678901234567']).toBe('76543210987654321');
  });

  it('parses numeric labels into emoji numbers', () => {
    const input = '1. <@&11111111111111111>';
    const res = service.parseMessage(input);
    expect(res['1️⃣']).toBe('11111111111111111');
  });

  it('parses multiple mappings in one message', () => {
    const input =
      '<:a:12345678901234567> <@&22222222222222222> ' +
      '2. <@&33333333333333333>';
    const res = service.parseMessage(input);

    expect(res['12345678901234567']).toBe('22222222222222222');
    expect(res['2️⃣']).toBe('33333333333333333');
  });

  it('returns empty object when no matches', () => {
    const res = service.parseMessage('no mappings here');
    expect(Object.keys(res).length).toBe(0);
  });
});
