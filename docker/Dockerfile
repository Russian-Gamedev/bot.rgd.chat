FROM oven/bun:1.3.11-alpine AS builder

WORKDIR /app

# Accept build arguments for git information
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG GIT_COMMIT_MESSAGE=unknown

COPY package.json bun.lock scripts ./ 

RUN bun install --frozen-lockfile

COPY . .

# Build a Linux Bun standalone executable inside the container.
RUN bun run build.ts

FROM alpine:3.22 AS production

WORKDIR /app

RUN apk add --no-cache ca-certificates tini libstdc++ libgcc

COPY --from=builder /app/dist/bot ./bot
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/assets ./assets

# Set git information as environment variables
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG GIT_COMMIT_MESSAGE=unknown
ENV GIT_BRANCH=$GIT_BRANCH
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_COMMIT_MESSAGE=$GIT_COMMIT_MESSAGE

ENV NODE_ENV=production

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./bot"]
