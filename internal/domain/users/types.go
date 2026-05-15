package users

import (
	"time"

	"bot.rgd.chat/internal/platforms/discord"
)

type User struct {
	ID              int32      `db:"id"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
	UserID          discord.ID `json:"user_id" db:"user_id"`
	GuildID         discord.ID `json:"guild_id" db:"guild_id"`
	Username        string     `json:"username" db:"username"`
	Avatar          string     `json:"avatar" db:"avatar"`
	Banner          *string    `json:"banner,omitempty" db:"banner"`
	BannerAlt       *string    `json:"banner_alt,omitempty" db:"banner_alt"`
	BannerColor     string     `json:"banner_color" db:"banner_color"`
	About           *string    `json:"about,omitempty" db:"about"`
	FirstJoinedAt   time.Time  `json:"first_joined_at" db:"first_joined_at"`
	LastActiveAt    time.Time  `json:"last_active_at" db:"last_active_at"`
	LeftAt          *time.Time `json:"left_at,omitempty" db:"left_at"`
	IsLeftGuild     bool       `json:"is_left_guild" db:"is_left_guild"`
	LeftCount       uint       `json:"left_count" db:"left_count"`
	Coins           int64      `json:"coins" db:"coins"`
	BirthDate       *string    `json:"birth_date,omitempty" db:"birth_date"`
	Reputation      uint       `json:"reputation" db:"reputation"`
	Experience      uint       `json:"experience" db:"experience"`
	VoiceTime       uint       `json:"voice_time" db:"voice_time"`
	ActiveStreak    uint       `json:"active_streak" db:"active_streak"`
	MaxActiveStreak uint       `json:"max_active_streak" db:"max_active_streak"`
}
