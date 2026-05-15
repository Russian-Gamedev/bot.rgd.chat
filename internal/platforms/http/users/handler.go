package users

import (
	"bot.rgd.chat/internal/domain/users"
	"bot.rgd.chat/internal/platforms/discord"
	"bot.rgd.chat/internal/platforms/http"
	"github.com/gin-gonic/gin"
)

type HTTPHandler struct {
	service *users.Service
}

func NewHTTPHandler(service *users.Service) *HTTPHandler {
	return &HTTPHandler{service: service}
}

func (h *HTTPHandler) RegisterHTTP(r gin.IRouter) {
	group := r.Group("/users")
	group.GET("/:id", h.getUsers)
}

func (h *HTTPHandler) getUsers(c *gin.Context) {
	userID := c.Param("id")

	id, err := discord.ParseID(userID)

	if err != nil || id <= 0 {
		http.Fail(c, 400, "invalid user ID format")
		return
	}

	user, err := h.service.Get(id)
	if err != nil {
		http.Fail(c, 500, err.Error())
		return
	}

	http.OK(c, user)
}
