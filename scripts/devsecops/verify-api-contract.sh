#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

required_routes=(
  "src/app/api/courses/route.ts"
  "src/app/api/courses/[id]/route.ts"
  "src/app/api/enrollments/route.ts"
)

missing=0
for route_file in "${required_routes[@]}"; do
  if [[ ! -f "${route_file}" ]]; then
    echo "[ERROR] Missing required Issue #5 API route: ${route_file}"
    missing=$((missing + 1))
  fi
done

if [[ ${missing} -gt 0 ]]; then
  echo "[ERROR] API contract precheck failed: ${missing} route file(s) missing."
  exit 1
fi

echo "[INFO] Running Issue #5 API contract regression tests..."
npm run test:contract:issue5
echo "[OK] Issue #5 API contract regression gate passed."
