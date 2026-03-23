#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f package.json ]]; then
  echo "[ERROR] package.json not found. Run this script from the project root."
  exit 1
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "[INFO] .env was missing; copied from .env.example."
  else
    echo "[ERROR] Missing .env and .env.example."
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] docker command is required for local PostgreSQL startup."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is required."
  exit 1
fi

if [[ -f docker-compose.dev.yml ]]; then
  docker compose -f docker-compose.dev.yml up -d postgres
fi

./scripts/devsecops/preflight-env.sh .env

npm ci

PRISMA_CONFIG_FLAG=""
if [[ -f prisma/prisma.config.ts ]]; then
  PRISMA_CONFIG_FLAG="--config=prisma/prisma.config.ts"
elif [[ -f prisma.config.ts ]]; then
  PRISMA_CONFIG_FLAG="--config=prisma.config.ts"
fi

npx prisma generate ${PRISMA_CONFIG_FLAG}
npx prisma migrate dev ${PRISMA_CONFIG_FLAG}
npx tsc --noEmit

echo "[INFO] If the app is running, execute route-guard checks:"
echo "       ./scripts/devsecops/verify-route-guards.sh http://localhost:3000"
