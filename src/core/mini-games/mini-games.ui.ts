import type { InteractionEditReplyOptions } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import type { DiscordID } from '#root/lib/types';

import { MiniGame } from './entities/mini-game-round.entity';
import type { RouletteColor } from './games/roulette/roulette.types';
import { MAX_BET, MIN_BET } from './mini-games.constants';

const BUTTON_PREFIX = 'minigame';
const CUSTOM_ID_PATTERN =
  /^minigame\/(flip|slot)\/(again|double|half)\/(\d+)\/(\d+)$/;
const ROULETTE_CUSTOM_ID_PATTERN =
  /^minigame\/roulette\/(red|black|green)\/(again|double|half)\/(\d+)\/(\d+)$/;

export type RoundButtonAction = 'again' | 'double' | 'half';

export interface RoundButtonPayload {
  game: MiniGame;
  action: RoundButtonAction;
  userId: string;
  bet: bigint;
  /** Chosen color, roulette only. */
  pick?: RouletteColor;
}

/**
 * necord routes components through path-to-regexp, so the registered
 * customId is a pattern with :params. The actual customIds are built by
 * buildRoundButtons and parsed back by parseRoundButtons.
 */
export function roundButtonRoute(game: MiniGame): string {
  return `${BUTTON_PREFIX}/${game}/:action/:userId/:bet`;
}

/** Roulette replays keep the chosen color, so it is part of the route. */
export function rouletteButtonRoute(): string {
  return `${BUTTON_PREFIX}/roulette/:pick/:action/:userId/:bet`;
}

/**
 * Acknowledge-and-edit adapter shared by slash command and button flows:
 * slash commands deferReply inside the round, buttons deferUpdate up front.
 */
export interface RoundMessenger {
  ack(): Promise<unknown>;
  edit(payload: InteractionEditReplyOptions): Promise<unknown>;
}

/** Bet for the next round depending on the pressed button. */
export function resolveRoundBet(
  action: RoundButtonAction,
  bet: bigint,
): bigint {
  if (action === 'double') return bet * 2n;
  if (action === 'half') return bet / 2n;
  return bet;
}

export function buildRoundButtons(
  game: MiniGame,
  userId: DiscordID,
  bet: bigint,
  pick?: RouletteColor,
): ActionRowBuilder<ButtonBuilder>[] {
  const prefix = pick
    ? `${BUTTON_PREFIX}/roulette/${pick}`
    : `${BUTTON_PREFIX}/${game}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}/again/${userId}/${bet}`)
      .setLabel('Ещё раз')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${prefix}/half/${userId}/${bet}`)
      .setLabel('Половина')
      .setEmoji('⏬')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(bet / 2n < BigInt(MIN_BET)),
    new ButtonBuilder()
      .setCustomId(`${prefix}/double/${userId}/${bet}`)
      .setLabel('Удвоить')
      .setEmoji('⏫')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(bet * 2n > BigInt(MAX_BET)),
  );
  return [row];
}

/** Strict parse — the route may match partials, so validate everything. */
export function parseRoundButtons(customId: string): RoundButtonPayload | null {
  const plain = CUSTOM_ID_PATTERN.exec(customId);
  if (plain) {
    const [, game, action, userId, bet] = plain;
    if (!Object.values(MiniGame).includes(game as MiniGame)) return null;
    return {
      game: game as MiniGame,
      action: action as RoundButtonAction,
      userId,
      bet: BigInt(bet),
    };
  }

  const roulette = ROULETTE_CUSTOM_ID_PATTERN.exec(customId);
  if (roulette) {
    const [, pick, action, userId, bet] = roulette;
    return {
      game: MiniGame.ROULETTE,
      action: action as RoundButtonAction,
      userId,
      bet: BigInt(bet),
      pick: pick as RouletteColor,
    };
  }

  return null;
}
