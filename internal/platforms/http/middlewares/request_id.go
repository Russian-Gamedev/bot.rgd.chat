package middlewares

import (
	"github.com/gin-gonic/gin"
	"github.com/oklog/ulid/v2"
)

const RequestIDKey = "X-Request-ID"

func RequestIDMiddleware() gin.HandlerFunc {
	return func(context *gin.Context) {
		reqID := context.GetHeader(RequestIDKey)
		if reqID == "" {
			reqID = ulid.Make().String()
		}
		context.Set(RequestIDKey, reqID)
		context.Header(RequestIDKey, reqID)

		context.Next()
	}
}

func GetRequestID(c *gin.Context) string {
	v, ok := c.Get(RequestIDKey)
	if !ok {
		return ""
	}

	return v.(string)
}
