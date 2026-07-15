import { TarotCard } from './tarot.data';

export type TarotPositionId = 'context' | 'obstacle' | 'outcome';
export interface TarotPosition {
  readonly id: TarotPositionId;
  readonly title: string;
}

export interface DrawnTarotCard {
  readonly position: TarotPosition;
  readonly card: TarotCard;
  readonly reversed: boolean;
}

export interface TarotDraw {
  readonly question: string;
  readonly cards: readonly DrawnTarotCard[];
}

export interface DrawTarotInput {
  readonly guildId: string;
  readonly userId: string;
  readonly question: string;
  readonly now?: Date;
  readonly timeZone?: string;
}

export type VerdictDirection =
  | 'yes'
  | 'likely_yes'
  | 'uncertain'
  | 'likely_no'
  | 'no';

export interface TarotInterpretation {
  context: string;
  obstacle: string;
  outcome: string;
  verdictDirection: VerdictDirection;
  verdict: string;
  advice: string;
}
