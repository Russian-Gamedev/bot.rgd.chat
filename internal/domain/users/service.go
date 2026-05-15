package users

import "bot.rgd.chat/internal/platforms/discord"

type Service struct {
	repo *UserRepository
}

func NewService(repo *UserRepository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Get(userId discord.ID) (*User, error) {
	return s.repo.Get(userId)
}
