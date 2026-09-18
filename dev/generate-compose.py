"""Regenerate dev/docker-compose.yml from docker-compose-local.yml (see header of the output file)."""
import yaml

src = yaml.safe_load(open("docker-compose-local.yml"))
svc = src["services"]
svc["plane-db"]["ports"] = ["15432:5432"]
svc["plane-redis"]["ports"] = ["16379:6379"]
svc["plane-minio"]["ports"] = ["19000:9000", "19090:9090"]
svc["api"]["ports"] = ["18000:8000"]
svc["proxy"] = {
    "image": "caddy:2-alpine",
    "restart": "unless-stopped",
    "networks": ["dev_env"],
    "volumes": ["./dev/Caddyfile:/etc/caddy/Caddyfile:ro"],
    "environment": {"FILE_SIZE_LIMIT": "5242880", "BUCKET_NAME": "uploads"},
    "extra_hosts": ["host.docker.internal:host-gateway"],
    "ports": ["8085:80"],
    "depends_on": ["api", "plane-minio"],
}
header = """# Generated from ../docker-compose-local.yml by dev/generate-compose.py — do not edit by hand.
# Differences: host ports remapped (db 15432, valkey 16379, minio 19000/19090, api 18000) and a Caddy
# proxy on http://localhost:8085 that fronts the API, MinIO uploads and the host web dev server.
# Run through dev/dc.sh so relative paths resolve from the repo root.
"""
open("dev/docker-compose.yml", "w").write(header + yaml.safe_dump(src, sort_keys=False))
