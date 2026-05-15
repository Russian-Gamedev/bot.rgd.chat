package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"bot.rgd.chat/internal/config"
	middlewares2 "bot.rgd.chat/internal/platforms/http/middlewares"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type Server struct {
	log        *zap.Logger
	srv        *http.Server
	engine     *gin.Engine
	registrars []RouterRegistrar
}

func (s *Server) Name() string {
	return "http"
}

func New(cfg *config.Config, log *zap.Logger, registrars []RouterRegistrar) (*Server, error) {

	router := gin.New()

	router.Use(
		middlewares2.RequestIDMiddleware(),
		middlewares2.Logger(log),
		gin.Recovery(),
		cors.New(cors.Config{
			AllowOrigins:     []string{"https://rgd.chat"},
			AllowMethods:     []string{"GET", "POST", "PUT", "DELETE"},
			AllowHeaders:     []string{"Content-Type", "Authorization"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}),
	)

	router.GET("/health", handleHealthCheck)

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: router,
	}

	return &Server{
		log:        log,
		srv:        srv,
		registrars: registrars,
		engine:     router,
	}, nil
}

func (s *Server) Start(ctx context.Context) error {

	api := s.engine.Group("/v1")

	for _, register := range s.registrars {
		register.RegisterHTTP(api)
	}

	go func() {
		if err := s.srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.log.Sugar().Fatal(err)
		}
	}()

	return nil
}

func (s *Server) Stop(ctx context.Context) error {

	if err := s.srv.Shutdown(ctx); err != nil {
		return fmt.Errorf("server: %w", err)
	}
	return nil
}

func handleHealthCheck(c *gin.Context) {

	OK(c, nil)

}
