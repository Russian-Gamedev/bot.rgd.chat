export enum GuildSettings {
  AuditLogChannel = 'audit_log_channel',
  EventMessageChannel = 'event_message_channel',
  ActiveRoleId = 'active_role_id',
  ActiveAutoGiveRole = 'active_auto_role',
  ActiveAutoGiveRoleThreshold = 'active_auto_role_threshold',
  ActiveAutoRemoveRoleThreshold = 'active_auto_remove_role_threshold',
  BarEnabled = 'bar_enabled',
  PostActivityMessages = 'post_activity_messages',
  BirthdayRoleId = 'birthday_role_id',
  MahoragaEnabled = 'mahoraga_enabled',
  MahoragaHoneypotMode = 'mahoraga_honeypot_mode',
  MahoragaRepeatMode = 'mahoraga_repeat_mode',
  MahoragaHoneypotChannelId = 'mahoraga_honeypot_channel_id',
  MahoragaHoneypotMessageId = 'mahoraga_honeypot_message_id',
  MahoragaLogChannelId = 'mahoraga_log_channel_id',
  MahoragaTextRepeatLimit = 'mahoraga_text_repeat_limit',
  MahoragaTextWindowSeconds = 'mahoraga_text_window_seconds',
  MahoragaLinkRepeatLimit = 'mahoraga_link_repeat_limit',
  MahoragaLinkWindowSeconds = 'mahoraga_link_window_seconds',
  MahoragaImageRepeatLimit = 'mahoraga_image_repeat_limit',
  MahoragaImageWindowSeconds = 'mahoraga_image_window_seconds',
  MahoragaMessageTrackingWindowSeconds = 'mahoraga_message_tracking_window_seconds',
}

export enum GuildEvents {
  MEMBER_FIRST_JOIN = 'member_first_join',
  MEMBER_JOIN = 'member_join',
  MEMBER_LEAVE = 'member_leave',
  MEMBER_BAN = 'member_ban',
  MEMBER_KICK = 'member_kick',
  MEMBER_SET_NAME = 'member_set_name',
}

export const GuildEventsParameters: Record<GuildEvents, string[]> = {
  [GuildEvents.MEMBER_FIRST_JOIN]: ['user'],
  [GuildEvents.MEMBER_JOIN]: ['user'],
  [GuildEvents.MEMBER_LEAVE]: ['user'],
  [GuildEvents.MEMBER_BAN]: ['user', 'moderator'],
  [GuildEvents.MEMBER_KICK]: ['user', 'moderator'],
  [GuildEvents.MEMBER_SET_NAME]: ['user', 'nickname'],
};
