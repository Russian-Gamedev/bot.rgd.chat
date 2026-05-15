package users

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type ModuleDeps struct {
	DB     *sqlx.DB
	Redis  *redis.Client
	Logger *zap.Logger
}

type Module struct {
	log     *zap.Logger
	repo    *UserRepository
	service *Service
}

func NewModule(deps *ModuleDeps) *Module {

	repo := NewUserRepository(deps.DB)
	service := NewService(repo)

	return &Module{
		log:     deps.Logger,
		repo:    repo,
		service: service,
	}
}

func (m *Module) Name() string {
	return "users"
}

func (m *Module) Start(ctx context.Context) error {
	m.log.Info("Starting users module")
	return nil
}

func (m *Module) Stop(ctx context.Context) error {
	m.log.Info("Stopping users module")
	return nil
}

func (m *Module) Service() *Service {
	return m.service
}
