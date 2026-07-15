import { describe, expect, it } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGameDto } from './games.dto';

const valid = {
  title: 'Community Game',
  description: '# Description',
  release_date: '2026-07-11',
  promo: 'Скоро релиз!',
  tags: ['Action'],
  authors: [
    {
      type: 'discord',
      discord_user_id: '123456789012345678',
      role: 'Программист',
    },
  ],
  links: [{ icon: 'steam', label: 'Steam', link: 'https://example.com/game' }],
  attachments: [{ type: 'image', url: 'https://example.com/image.png' }],
};

describe('games DTO validation', () => {
  it('accepts a valid game payload', async () => {
    const dto = plainToInstance(CreateGameDto, {
      ...valid,
      slug: ' Custom Game URL ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.slug).toBe('custom-game-url');
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
      authors: [
        {
          type: 'discord',
          discord_user_id: '123',
          name: 'Team',
          role: 'Программист',
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'authors')).toBe(true);
  });

  it('requires a non-empty author role', async () => {
    const dto = plainToInstance(CreateGameDto, {
      ...valid,
      authors: [
        {
          type: 'discord',
          discord_user_id: '123456789012345678',
          role: ' ',
        },
      ],
    });

    expect(
      (await validate(dto)).some((error) => error.property === 'authors'),
    ).toBe(true);
  });

  it('rejects promo text longer than 100 characters', async () => {
    const dto = plainToInstance(CreateGameDto, {
      ...valid,
      promo: 'x'.repeat(101),
    });

    expect(
      (await validate(dto)).some((error) => error.property === 'promo'),
    ).toBe(true);
  });

  it('requires at least one image attachment', async () => {
    const missing = plainToInstance(CreateGameDto, {
      ...valid,
      attachments: undefined,
    });
    const videoOnly = plainToInstance(CreateGameDto, {
      ...valid,
      attachments: [
        { type: 'external_video', url: 'https://example.com/video' },
      ],
    });

    expect(
      (await validate(missing)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(true);
    expect(
      (await validate(videoOnly)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(true);
  });
});
