include .env.development

## run: Start the bot
bot:
	@echo "starting bot..."
	@go run cmd/bot/main.go

## migrate-up: Run database migrations up
migrate-up:
	@echo "Running migrations up..."
	@migrate -path migrations -database "$(DATABASE_URL)" up

## migrate-down: Rollback database migrations
migrate-down:
	@echo "Running migrations down..."
	@migrate -path migrations -database "$(DATABASE_URL)" down 1

## migrate-create: Create a new migration file (usage: make migrate-create name=migration_name)
migrate-create:
	@echo "Creating migration: $(name)"
	@migrate create -ext sql -dir migrations -seq $(name)

## clean: Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf bin/

## up docker compose dev
compose-dev:
	@echo "Starting Docker Compose for development..."
	@docker-compose -f docker/docker-compose.dev.yaml up -d