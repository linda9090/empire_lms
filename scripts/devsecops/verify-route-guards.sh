#!/usr/bin/env bash
set -euo pipefail

APP_URL="${1:-http://localhost:3000}"

protected_paths=(
  "/dashboard"
  "/teacher/dashboard"
  "/student/dashboard"
  "/guardian/dashboard"
  "/admin/dashboard"
)

failures=0

for path in "${protected_paths[@]}"; do
  tmp_headers="$(mktemp)"
  status_code="$(curl -sS -o /dev/null -D "${tmp_headers}" -w "%{http_code}" "${APP_URL}${path}")"
  location_header="$(awk 'tolower($1)=="location:" {print $2}' "${tmp_headers}" | tr -d '\r' | tail -n 1)"
  rm -f "${tmp_headers}"

  if [[ "${status_code}" =~ ^30[1278]$ ]] && [[ "${location_header}" == *"/login"* ]]; then
    echo "[OK] ${path} -> redirected to login (${status_code})"
  else
    echo "[ERROR] ${path} expected redirect to /login but got status=${status_code}, location=${location_header:-<none>}"
    failures=$((failures + 1))
  fi
done

if [[ ${failures} -gt 0 ]]; then
  echo "[ERROR] Route guard verification failed (${failures} paths)."
  exit 1
fi

echo "[OK] Route guard verification passed."
