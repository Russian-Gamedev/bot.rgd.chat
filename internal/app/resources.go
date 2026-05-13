package app

import (
	"context"
	"errors"
	"fmt"

	"bot.rgd.chat/internal/config"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type Resource interface {
	Close(ctx context.Context) error
}

type Resources struct {
	Postgres *sqlx.DB
	Redis    *redis.Client

	logger *zap.Logger
}

func NewResources(ctx context.Context, cfg *config.Config, log *zap.Logger) (*Resources, error) {

	pg, err := sqlx.Connect("postgres", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}

	log.Sugar().Info("Connected to database")

	redisClient := redis.NewClient(&redis.Options{
		Addr: cfg.RedisURL,
	})

	_, err = redisClient.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}

	log.Sugar().Info("Connected to redis")

	return &Resources{
		Postgres: pg,
		Redis:    redisClient,
		logger:   log,
	}, nil
}

func (r *Resources) Close(ctx context.Context) error {

	var err error

	if r.Redis != nil {
		if e := r.Redis.Close(); e != nil {
			err = errors.Join(err, fmt.Errorf("redis: %w", e))
		} else {
			r.logger.Sugar().Info("Disconnected from redis")
		}
	}

	if r.Postgres != nil {
		if e := r.Postgres.Close(); e != nil {
			err = errors.Join(err, fmt.Errorf("postgres: %w", e))
		} else {
			r.logger.Sugar().Info("Disconnected from database")
		}
	}

	return err
}
