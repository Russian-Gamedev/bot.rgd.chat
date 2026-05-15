package http

import (
	"net/http"

	"bot.rgd.chat/internal/platforms/http/middlewares"
	"github.com/gin-gonic/gin"
)

type Response struct {
	Success   bool        `json:"success"`
	Data      interface{} `json:"data,omitempty"`
	Error     *ErrorInfo  `json:"error,omitempty"`
	RequestID string      `json:"request_id"`
}

type ErrorInfo struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Success:   true,
		Data:      data,
		RequestID: middlewares.GetRequestID(c),
	})
}

func Fail(c *gin.Context, code int, message string) {
	c.JSON(code, Response{
		Success: false,
		Error: &ErrorInfo{
			Code:    code,
			Message: message,
		},
		RequestID: middlewares.GetRequestID(c),
	})
}

type RouterRegistrar interface {
	RegisterHTTP(r gin.IRouter)
}
