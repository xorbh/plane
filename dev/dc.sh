#!/bin/sh
# Full local backend stack: db, valkey, rabbitmq, minio, api, worker, beat, migrator, proxy.
# Usage: dev/dc.sh up -d --build | dev/dc.sh logs -f api | dev/dc.sh down -v
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec docker compose --project-directory "$ROOT" -f "$ROOT/dev/docker-compose.yml" "$@"
