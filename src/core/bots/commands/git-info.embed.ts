import {
  type AppStartupContext,
  describeStartupReason,
} from '#common/app-lifecycle.service';
import { type GitInfo } from '#common/git-info.service';
import { Colors } from '#config/constants';

export function buildGitInfoEmbed(
  gitInfo: GitInfo,
  startupContext?: AppStartupContext,
) {
  const fields = [
    {
      name: '🌿 Branch',
      value: `[\`${gitInfo.branch}\`](${gitInfo.branchLink})`,
      inline: true,
    },
    {
      name: '📝 Commit',
      value: `[\`${gitInfo.shortCommit}\`](${gitInfo.commitLink})`,
      inline: true,
    },
    {
      name: '💬 Message',
      value: `\`${gitInfo.commitMessage}\``,
      inline: false,
    },
  ];

  if (startupContext) {
    fields.push({
      name: '🔄 Причина запуска',
      value: [
        `\`${startupContext.reason}\``,
        describeStartupReason(startupContext.reason),
      ].join('\n'),
      inline: false,
    });
    fields.push({
      name: '🔁 Количество рестартов',
      value: `\`${startupContext.currentStart.restartCount}\``,
      inline: true,
    });

    if (startupContext.previousStart) {
      fields.push({
        name: '📦 Предыдущий инстанс',
        value: buildPreviousInstanceSummary(startupContext),
        inline: false,
      });
    }
  }

  fields.push({
    name: '🔗 Repository',
    value: `[Russian-Gamedev/rgd-bot](https://github.com/Russian-Gamedev/rgd-bot)`,
    inline: false,
  });

  return {
    title: '🤖 Bot Version Information',
    color: Colors.Primary,
    fields,
    timestamp: new Date().toISOString(),
  };
}

function buildPreviousInstanceSummary(startupContext: AppStartupContext) {
  const previousStart = startupContext.previousStart;
  if (!previousStart) {
    return 'Нет данных о предыдущем инстансе';
  }

  const previousStopMatches =
    startupContext.previousStop?.instanceId === previousStart.instanceId;
  const shutdownState =
    previousStopMatches && startupContext.previousStop?.graceful
      ? 'graceful'
      : 'ungraceful';
  const signal = previousStopMatches
    ? (startupContext.previousStop?.signal ?? 'none')
    : 'missing';

  return [
    `Коммит: \`${previousStart.commit.slice(0, 7)}\``,
    `Остановка: \`${shutdownState}\``,
    `Сигнал: \`${signal}\``,
  ].join('\n');
}
