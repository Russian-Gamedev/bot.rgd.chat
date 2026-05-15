package users

import (
	"bot.rgd.chat/internal/platforms/discord"
	sq "github.com/Masterminds/squirrel"
	"github.com/jmoiron/sqlx"
)

type UserRepository struct {
	db   *sqlx.DB
	psql sq.StatementBuilderType
}

func NewUserRepository(db *sqlx.DB) *UserRepository {
	return &UserRepository{db: db, psql: sq.StatementBuilder.PlaceholderFormat(sq.Dollar)}
}

func (r *UserRepository) Get(userId discord.ID) (*User, error) {

	query := r.psql.Select("*").From("users").Where(sq.Eq{"user_id": userId})

	sql, args, err := query.ToSql()
	if err != nil {
		return nil, err
	}

	var user User

	err = r.db.Get(&user, sql, args...)

	if err != nil {
		return nil, err
	}

	return &user, nil
}
