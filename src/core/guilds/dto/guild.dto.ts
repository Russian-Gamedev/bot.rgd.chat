export class GuildDto {
  id: string;

  name: string;

  owner_id: string;

  icon_url?: string | null;

  custom_banner_url?: string | null;
}

export class GuildRoleDto {
  id: number;

  guild_id: string;

  role_id: string;

  name: string;

  color: string;

  position: number;
}
