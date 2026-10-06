import { describe, expect, it } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectDto } from './projects.dto';

const valid = {
  title: 'Community Project',
  description: '# Description',
  release_date: '2026-07-11',
  type: 'game',
  promo: 'Скоро релиз!',
  tags: ['Action'],
  authors: [
    {
      type: 'discord',
      discord_user_id: '123456789012345678',
      role: 'Программист',
    },
  ],
  links: [
    { icon: 'steam', label: 'Steam', link: 'https://example.com/project' },
  ],
  attachments: [{ type: 'image', url: 'https://example.com/image.png' }],
};

describe('projects DTO validation', () => {
  it('accepts a valid project payload', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      ...valid,
      slug: ' Custom Project URL ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.slug).toBe('custom-project-url');
  });

  it('rejects an unknown project type', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      ...valid,
      type: 'mod',
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'type'),
    ).toBe(true);
  });

  it('requires a project type', async () => {
    const { type: _type, ...withoutType } = valid;
    const dto = plainToInstance(CreateProjectDto, withoutType);
    expect(
      (await validate(dto)).some((error) => error.property === 'type'),
    ).toBe(true);
  });

  it('rejects more than five links and non-HTTPS URLs', async () => {
    const dto = plainToInstance(CreateProjectDto, {
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
    const dto = plainToInstance(CreateProjectDto, {
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
    const dto = plainToInstance(CreateProjectDto, {
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
    const dto = plainToInstance(CreateProjectDto, {
      ...valid,
      promo: 'x'.repeat(101),
    });

    expect(
      (await validate(dto)).some((error) => error.property === 'promo'),
    ).toBe(true);
  });

  it('requires at least one image attachment', async () => {
    const missing = plainToInstance(CreateProjectDto, {
      ...valid,
      attachments: undefined,
    });
    const videoOnly = plainToInstance(CreateProjectDto, {
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
