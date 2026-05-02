import { describe, expect, it } from 'bun:test';

import { type AppStartupContext } from '#common/app-lifecycle.service';
import { type GitInfo } from '#common/git-info.service';

import { buildGitInfoEmbed } from './git-info.embed';

const gitInfo: GitInfo = {
  branch: 'main',
  commit: 'abcdef1234567890',
  commitMessage: 'Ship restart reason logging',
  shortCommit: 'abcdef1',
  branchLink: 'https://example.com/branch',
  commitLink: 'https://example.com/commit',
};

describe('buildGitInfoEmbed', () => {
  it('includes restart reason and previous instance details', () => {
    const startupContext: AppStartupContext = {
      reason: 'crash_restart',
      currentStart: {
        schemaVersion: 1,
        instanceId: 'instance-current',
        branch: 'main',
        commit: gitInfo.commit,
        startedAt: '2026-05-02T12:00:00.000Z',
      },
      previousStart: {
        schemaVersion: 1,
        instanceId: 'instance-previous',
        branch: 'main',
        commit: '1234567fedcba',
        startedAt: '2026-05-02T11:00:00.000Z',
      },
    };

    const embed = buildGitInfoEmbed(gitInfo, startupContext);

    expect(embed.fields).toContainEqual(
      expect.objectContaining({
        name: '🔄 Причина запуска',
        value: expect.stringContaining('crash_restart'),
      }),
    );
    expect(embed.fields).toContainEqual(
      expect.objectContaining({
        name: '📦 Предыдущий инстанс',
        value: expect.stringContaining('Коммит: `1234567`'),
      }),
    );
    expect(embed.fields).toContainEqual(
      expect.objectContaining({
        name: '📦 Предыдущий инстанс',
        value: expect.stringContaining('Остановка: `ungraceful`'),
      }),
    );
  });
});
