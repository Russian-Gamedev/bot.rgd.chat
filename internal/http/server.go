package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"bot.rgd.chat/internal/config"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type Server struct {
	log *zap.Logger
	srv *http.Server
}

func (s *Server) Name() string {
	return "http"
}

func New(cfg *config.Config, log *zap.Logger) (*Server, error) {

	router := gin.New()

	router.Use(gin.Recovery())

	if cfg.Environment == config.Development {
		router.Use(gin.Logger())
	}

	router.GET("/health", handleHealthCheck)

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: router,
	}

	return &Server{
		log: log,
		srv: srv,
	}, nil
}

func (s *Server) Start(ctx context.Context) error {

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
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}
