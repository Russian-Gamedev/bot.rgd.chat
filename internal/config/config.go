package config

import (
	"os"

	"github.com/joho/godotenv"
	"go-simpler.org/env"
)

type Environment string

const (
	Development Environment = "development"
	Production  Environment = "production"
	Test        Environment = "test"
)

type Config struct {
	Environment Environment `env:"ENVIRONMENT" default:"development"`
	Port        uint16      `env:"PORT" default:"8080"`
	BaseURL     string      `env:"BASE_URL"`
	DatabaseURL string      `env:"DATABASE_URL,required"`
	RedisURL    string      `env:"REDIS_URL"`

	Discord struct {
		BotToken     string `env:"BOT_TOKEN"`
		ClientID     string `env:"CLIENT_ID"`
		ClientSecret string `env:"CLIENT_SECRET"`
		RedirectURL  string `env:"REDIRECT_URL"`
	} `env:"DISCORD_"`

	Telegram struct {
		BotToken string `env:"BOT_TOKEN"`
		ApiURL   string `env:"API_URL"`
	} `env:"TELEGRAM_"`

	Owners []string `env:"OWNERS"`
}

func LoadConfig() (*Config, error) {

	environment := os.Getenv("ENVIRONMENT")
	if environment == "" {
		environment = "development"
	}

	envFile := ".env." + environment

	if _, err := os.Stat(envFile); err == nil {
		if err := godotenv.Load(envFile); err != nil {
			return nil, err
		}
	}

	var cfg = &Config{}
	if err := env.Load(cfg, &env.Options{SliceSep: ","}); err != nil {
		return nil, err
	}
	return cfg, nil
}
