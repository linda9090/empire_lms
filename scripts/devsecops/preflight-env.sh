#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env"
USE_ENV_FILE=1
FORBID_DOTENV_FILES=0

print_usage() {
  cat <<'USAGE'
Usage:
  preflight-env.sh [ENV_FILE]
  preflight-env.sh --env-file ENV_FILE [--forbid-dotenv]
  preflight-env.sh --from-env [--forbid-dotenv]

Options:
  --env-file <path>   Load and validate env values from the given file.
  --from-env          Validate already-exported environment variables only.
  --forbid-dotenv     Fail if any .env* runtime file exists in project root.
  -h, --help          Show this help message.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      if [[ $# -lt 2 ]]; then
        echo "[ERROR] --env-file requires a path."
        exit 1
      fi
      ENV_FILE="$2"
      USE_ENV_FILE=1
      shift 2
      ;;
    --from-env)
      USE_ENV_FILE=0
      shift
      ;;
    --forbid-dotenv)
      FORBID_DOTENV_FILES=1
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      ENV_FILE="$1"
      USE_ENV_FILE=1
      shift
      ;;
  esac
done

if [[ ${FORBID_DOTENV_FILES} -eq 1 ]]; then
  for dotenv_file in .env .env.local .env.production .env.production.local; do
    if [[ -f "${dotenv_file}" ]]; then
      echo "[ERROR] ${dotenv_file} detected. Use CI secret management instead."
      exit 1
    fi
  done
fi

if [[ ${USE_ENV_FILE} -eq 1 ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ERROR] Missing env file: ${ENV_FILE}"
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

required_vars=(
  DATABASE_URL
  BETTER_AUTH_SECRET
  NEXT_PUBLIC_APP_URL
  PAYMENT_MODE
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "[ERROR] ${var_name} is required."
    exit 1
  fi
done

if [[ "${DATABASE_URL}" != postgresql://* ]]; then
  echo "[ERROR] DATABASE_URL must start with postgresql://"
  exit 1
fi

if [[ ${#BETTER_AUTH_SECRET} -lt 32 ]]; then
  echo "[ERROR] BETTER_AUTH_SECRET must be at least 32 characters."
  exit 1
fi

case "${PAYMENT_MODE}" in
  mock)
    ;;
  stripe)
    if [[ -z "${STRIPE_SECRET_KEY:-}" || -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
      echo "[ERROR] Stripe mode requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET."
      exit 1
    fi
    ;;
  paypal)
    if [[ -z "${PAYPAL_CLIENT_ID:-}" || -z "${PAYPAL_CLIENT_SECRET:-}" ]]; then
      echo "[ERROR] PayPal mode requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
      exit 1
    fi
    ;;
  *)
    echo "[ERROR] PAYMENT_MODE must be one of: mock, stripe, paypal."
    exit 1
    ;;
esac

if [[ ${USE_ENV_FILE} -eq 1 ]]; then
  echo "[OK] Environment preflight passed (${ENV_FILE})."
else
  echo "[OK] Environment preflight passed (exported environment)."
fi
