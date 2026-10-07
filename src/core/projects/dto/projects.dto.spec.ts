import 'reflect-metadata';

import { describe, expect, it } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectDto, CreateProjectUploadDto } from './projects.dto';

const UPLOAD_ID = '01986b4a-1a2b-7c3d-9e4f-5a6b7c8d9e0f';

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
  attachments: [{ type: 'image', upload_id: UPLOAD_ID }],
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

  it('accepts a missing release date', async () => {
    const { release_date: _date, ...withoutDate } = valid;
    const dto = plainToInstance(CreateProjectDto, withoutDate);
    expect(
      (await validate(dto)).some((error) => error.property === 'release_date'),
    ).toBe(false);
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

  it('defaults a missing project type without validation errors', async () => {
    const { type: _type, ...withoutType } = valid;
    const dto = plainToInstance(CreateProjectDto, withoutType);
    expect(
      (await validate(dto)).some((error) => error.property === 'type'),
    ).toBe(false);
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

  it('accepts a partial payload without tags, authors or attachments', async () => {
    const { attachments: _a, authors: _b, tags: _c, ...minimal } = valid;
    const dto = plainToInstance(CreateProjectDto, minimal);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    const videoOnly = plainToInstance(CreateProjectDto, {
      ...valid,
      attachments: [
        { type: 'external_video', url: 'https://example.com/video' },
      ],
    });
    expect(
      (await validate(videoOnly)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(false);
  });

  it('rejects an image attachment with a url or a missing upload_id', async () => {
    const withUrl = plainToInstance(CreateProjectDto, {
      ...valid,
      attachments: [{ type: 'image', url: 'https://example.com/image.png' }],
    });
    const withBoth = plainToInstance(CreateProjectDto, {
      ...valid,
      attachments: [
        {
          type: 'image',
          upload_id: UPLOAD_ID,
          url: 'https://example.com/image.png',
        },
      ],
    });

    expect(
      (await validate(withUrl)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(true);
    expect(
      (await validate(withBoth)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(true);
  });

  it('rejects an external_video attachment with an upload_id or a bad url', async () => {
    const withUpload = plainToInstance(CreateProjectDto, {
      ...valid,
      attachments: [
        { type: 'external_video', upload_id: UPLOAD_ID },
        { type: 'image', upload_id: UPLOAD_ID },
      ],
    });
    const withHttpUrl = plainToInstance(CreateProjectDto, {
      ...valid,
      attachments: [
        { type: 'external_video', url: 'http://example.com/video' },
        { type: 'image', upload_id: UPLOAD_ID },
      ],
    });

    expect(
      (await validate(withUpload)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(true);
    expect(
      (await validate(withHttpUrl)).some(
        (error) => error.property === 'attachments',
      ),
    ).toBe(true);
  });

  it('accepts a null banner id and rejects a non-uuid one', async () => {
    const nullable = plainToInstance(CreateProjectDto, {
      ...valid,
      banner_upload_id: null,
    });
    expect(await validate(nullable)).toHaveLength(0);

    const invalid = plainToInstance(CreateProjectDto, {
      ...valid,
      banner_upload_id: 'not-a-uuid',
    });
    expect(
      (await validate(invalid)).some(
        (error) => error.property === 'banner_upload_id',
      ),
    ).toBe(true);
  });
});

describe('project upload DTO validation', () => {
  it('accepts an image upload request', async () => {
    const dto = plainToInstance(CreateProjectUploadDto, {
      kind: 'attachment',
      content_type: 'image/png',
      size_bytes: 1024,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects non-image content types and oversized files', async () => {
    const video = plainToInstance(CreateProjectUploadDto, {
      kind: 'attachment',
      content_type: 'video/mp4',
      size_bytes: 1024,
    });
    const oversized = plainToInstance(CreateProjectUploadDto, {
      kind: 'banner',
      content_type: 'image/png',
      size_bytes: 26 * 1024 * 1024,
    });

    expect(
      (await validate(video)).some(
        (error) => error.property === 'content_type',
      ),
    ).toBe(true);
    expect(
      (await validate(oversized)).some(
        (error) => error.property === 'size_bytes',
      ),
    ).toBe(true);
  });

  it('rejects an unknown kind', async () => {
    const dto = plainToInstance(CreateProjectUploadDto, {
      kind: 'sticker',
      content_type: 'image/png',
      size_bytes: 1024,
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'kind'),
    ).toBe(true);
  });
});
