import { describe, expect, it, mock } from 'bun:test';

import { PatronsController } from './patrons.controller';
import { PatronsService } from './patrons.service';

describe('PatronsController', () => {
  it('returns patrons from service', async () => {
    const service = {
      getPatrons: mock(() =>
        Promise.resolve([
          {
            user: {
              id: '123456789012345678',
              username: 'patron',
              avatar_url: 'avatar.png',
              banner: '#fff',
            },
            value: 1500,
          },
        ]),
      ),
    } as unknown as PatronsService;
    const controller = new PatronsController(service);

    await expect(controller.getPatrons()).resolves.toEqual([
      {
        user: {
          id: '123456789012345678',
          username: 'patron',
          avatar_url: 'avatar.png',
          banner: '#fff',
        },
        value: 1500,
      },
    ]);
  });
});
