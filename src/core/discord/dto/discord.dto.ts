export class DiscordMembersStatsDto {
  total: number;

  online: number;
}

export class DiscordInviteInfoDto {
  code: string;

  title: string;

  description: string | null;

  memberCount?: number | null;

  presenceCount?: number | null;

  expiresAt?: Date | null;

  url: string;

  icon_url: string | null;

  banner_url: string | null;
}
