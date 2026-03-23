#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] Missing env file: ${ENV_FILE}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

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

echo "[OK] Environment preflight passed."
