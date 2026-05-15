package middlewares

import (
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const LoggerKey = "logger"

func Logger(log *zap.Logger) gin.HandlerFunc {
	return func(context *gin.Context) {
		start := time.Now()

		requestID := GetRequestID(context)

		reqLogger := log.With(
			zap.String("request_id", requestID),
			zap.String("method", context.Request.Method),
			zap.String("path", context.Request.URL.Path),
		)

		context.Set(LoggerKey, reqLogger)

		context.Next()

		latency := time.Since(start)

		fields := []zap.Field{
			zap.Int("status", context.Writer.Status()),
			zap.Duration("latency", latency),
			zap.String("ip", context.ClientIP()),
			zap.String("user_agent", context.Request.UserAgent()),
			zap.String("request_id", requestID),
			zap.Int("size", context.Writer.Size()),
		}

		if len(context.Errors) > 0 {
			fields = append(fields, zap.String("s", context.Errors.String()))
			reqLogger.Error("request failed", fields...)
			return
		}

		reqLogger.Info("request completed", fields...)
	}
}

func GetLogger(c *gin.Context) *zap.Logger {
	v, ok := c.Get(LoggerKey)
	if !ok {
		return zap.NewNop()
	}

	return v.(*zap.Logger)
}
