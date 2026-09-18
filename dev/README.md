# Local development stack

1. `./setup.sh` (creates the `.env` files), then in `apps/api/.env` set `DEBUG=1`, `USE_MINIO=1`,
   `AWS_S3_ENDPOINT_URL="http://plane-minio:9000"`, `WEB_URL` and `APP_BASE_URL` to `http://localhost:8085`,
   and add `http://localhost:8085` to `CORS_ALLOWED_ORIGINS`. In `apps/web/.env` point `VITE_API_BASE_URL`
   and `VITE_WEB_BASE_URL` at `http://localhost:8085`.
2. `dev/dc.sh up -d --build` starts Postgres, Valkey, RabbitMQ, MinIO, the API, the Celery worker and beat,
   the migrator and a Caddy proxy on http://localhost:8085.
3. `pnpm install && pnpm turbo run build --filter='web^...' && cd apps/web && pnpm dev` runs the web app on
   port 3000; open the app through the proxy at http://localhost:8085.
4. First run only: create a user and mark the instance as set up, e.g.
   `dev/dc.sh exec api python manage.py shell` and follow the snippet in dev/bootstrap.py, then
   `dev/dc.sh exec api python manage.py create_instance_admin <email>`.
