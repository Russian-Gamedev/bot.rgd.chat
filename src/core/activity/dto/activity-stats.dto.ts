export interface ActivityDayDto {
  date: string;
  messageScore: number;
  voiceSeconds: number;
  reactionCount: number;
}

export interface ActivityTotalsDto {
  messageScore: number;
  voiceSeconds: number;
  reactionCount: number;
}

export interface ActivityStreakDto {
  current: number;
  max: number;
}

export interface UserActivityDto {
  isPublic: boolean;
  /** Per-day graph data; null when the user keeps their activity graph private. */
  days: ActivityDayDto[] | null;
  totals: ActivityTotalsDto;
  streak: ActivityStreakDto;
}

export interface ActivityOverviewDayDto extends ActivityDayDto {
  activeUsers: number;
}

export interface ActivityOverviewDto {
  days: ActivityOverviewDayDto[];
  totals: ActivityTotalsDto;
  activeWeekUsers: number;
}
