package app

import (
	"context"
	"errors"
	"fmt"

	"bot.rgd.chat/internal/config"
	"bot.rgd.chat/internal/domain/users"
	httpServer "bot.rgd.chat/internal/platforms/http"
	usersHttp "bot.rgd.chat/internal/platforms/http/users"
	"go.uber.org/zap"
)

type Module interface {
	Name() string
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
}

type App struct {
	log *zap.Logger

	resources *Resources

	modules []Module
}

func New(ctx context.Context, cfg *config.Config, log *zap.Logger) (*App, error) {

	resources, err := NewResources(ctx, cfg, log)
	if err != nil {
		return nil, err
	}

	userModule := users.NewModule(&users.ModuleDeps{
		Logger: log.Named("users"),
		DB:     resources.Postgres,
		Redis:  resources.Redis,
	})

	httpModule, err := httpServer.New(cfg, log, []httpServer.RouterRegistrar{
		usersHttp.NewHTTPHandler(userModule.Service()),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create http server: %w", err)
	}

	return &App{
		log: log,
		modules: []Module{
			userModule,
			httpModule,
		},
		resources: resources,
	}, nil
}

func (app *App) Start(ctx context.Context) error {

	app.log.Info("Starting application")

	for _, module := range app.modules {
		if err := module.Start(ctx); err != nil {
			app.log.Error("failed to start module",
				zap.String("module", module.Name()),
				zap.Error(err),
			)
			return fmt.Errorf("start module %s: %w", module.Name(), err)
		}

		app.log.Info("module started", zap.String("module", module.Name()))
	}

	return nil
}
func (app *App) Stop(ctx context.Context) error {
	var result error

	for i := len(app.modules) - 1; i >= 0; i-- {
		module := app.modules[i]

		if err := module.Stop(ctx); err != nil {
			app.log.Error("failed to stop module",
				zap.String("module", module.Name()),
				zap.Error(err),
			)

			result = errors.Join(result, fmt.Errorf("stop module %s: %w", module.Name(), err))
			continue
		}

		app.log.Info("module stopped", zap.String("module", module.Name()))
	}

	if err := app.resources.Close(ctx); err != nil {
		result = errors.Join(result, fmt.Errorf("close resources: %w", err))
	}

	return result
}

func (app *App) Name() string {
	return "application"
}
