package app

import (
	"context"
	"errors"
	"fmt"

	"bot.rgd.chat/internal/config"
	httpServer "bot.rgd.chat/internal/http"
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

	httpModule, err := httpServer.New(cfg, log)
	if err != nil {
		return nil, fmt.Errorf("failed to create http server: %w", err)
	}

	return &App{
		log: log,
		modules: []Module{
			httpModule,
		},
		resources: resources,
	}, nil
}

func (app *App) Start(ctx context.Context) error {
	/// Start resource first

	log := app.log.Sugar()

	for _, module := range app.modules {
		if err := module.Start(ctx); err != nil {
			log.Error("failed to start module", zap.Error(err))
			return fmt.Errorf("module: %w", err)
		}

		log.Named(module.Name()).Info("started")
	}

	return nil
}

func (app *App) Stop(ctx context.Context) error {

	var result error

	log := app.log.Sugar()

	for i := len(app.modules) - 1; i >= 0; i-- {
		if err := app.modules[i].Stop(ctx); err != nil {
			log.Error("failed to stop module", zap.Error(err))
			result = errors.Join(result, fmt.Errorf("module: %w", err))
		}

		log.Named(app.modules[i].Name()).Info("stopped")
	}

	if err := app.resources.Close(ctx); err != nil {
		result = errors.Join(result, fmt.Errorf("resources: %w", err))
	}

	return result
}
