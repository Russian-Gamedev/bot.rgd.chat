import { describe, expect, it } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGameDto } from './games.dto';

const valid = {
  title: 'Community Game',
  description: '# Description',
  release_date: '2026-07-11',
  tags: ['Action'],
  authors: [{ type: 'discord', discord_user_id: '123456789012345678' }],
  links: [{ icon: 'steam', label: 'Steam', link: 'https://example.com/game' }],
  attachments: [{ type: 'image', url: 'https://example.com/image.png' }],
};

describe('games DTO validation', () => {
  it('accepts a valid game payload', async () => {
    expect(await validate(plainToInstance(CreateGameDto, valid))).toHaveLength(
      0,
    );
  });

  it('rejects more than five links and non-HTTPS URLs', async () => {
    const dto = plainToInstance(CreateGameDto, {
      ...valid,
      links: Array.from({ length: 6 }, () => ({
        icon: 'web',
        label: 'Web',
        link: 'http://example.com',
      })),
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'links'),
    ).toBe(true);
  });

  it('rejects an author containing both Discord ID and text name', async () => {
    const dto = plainToInstance(CreateGameDto, {
      ...valid,
      authors: [{ type: 'discord', discord_user_id: '123', name: 'Team' }],
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'authors')).toBe(true);
  });
});
