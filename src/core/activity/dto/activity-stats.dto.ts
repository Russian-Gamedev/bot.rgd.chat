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
  days: ActivityDayDto[];
  totals: ActivityTotalsDto;
  streak: ActivityStreakDto;
}

export interface CurrentUserActivityDto extends UserActivityDto {
  isPublic: boolean;
}

export interface ActivityOverviewDayDto extends ActivityDayDto {
  activeUsers: number;
}

export interface ActivityOverviewDto {
  days: ActivityOverviewDayDto[];
  totals: ActivityTotalsDto;
  activeWeekUsers: number;
}
