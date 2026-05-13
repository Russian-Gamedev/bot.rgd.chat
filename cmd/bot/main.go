package main

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"
	"time"

	"bot.rgd.chat/internal/app"
	"bot.rgd.chat/internal/config"
	"bot.rgd.chat/pkg/logger"
	"go-simpler.org/env"
)

func main() {

	ctx := context.Background()

	appLogger, err := logger.SetupLogger()
	if err != nil {
		panic(err)
	}

	defer appLogger.Sync()

	appConfig, err := config.LoadConfig()
	if err != nil {

		if notSetErr, ok := errors.AsType[*env.NotSetError](err); ok {
			appLogger.Sugar().Errorf("Missing required environment variables: %v", notSetErr)
			return
		}

		appLogger.Sugar().Fatalw("failed to load config:", "error", err)
	}

	appLogger.Sugar().Infof("Starting application in %s %s", appConfig.Environment, "mode")

	application, err := app.New(ctx, appConfig, appLogger)
	if err != nil {
		appLogger.Sugar().Fatal(err)
	}

	runCtx, cancel := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := application.Start(runCtx); err != nil {
		appLogger.Sugar().Fatalw("failed to start application:", "error", err)
	}

	<-runCtx.Done()

	stopCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := application.Stop(stopCtx); err != nil {
		appLogger.Sugar().Fatalw("failed to stop application:", "error", err)
	}

	appLogger.Sugar().Info("Application stopped")
}
