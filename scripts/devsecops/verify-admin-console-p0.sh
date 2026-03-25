#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-.}"
if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "[ERROR] Target directory not found: ${TARGET_DIR}"
  exit 1
fi
TARGET_DIR="$(cd "${TARGET_DIR}" && pwd)"

checks=0
failures=0

has_pattern() {
  local pattern="$1"
  local file="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -Fq -- "${pattern}" "${file}"
    return $?
  fi

  grep -Fq -- "${pattern}" "${file}"
}

check_file() {
  local rel_path="$1"
  local label="$2"
  local abs_path="${TARGET_DIR}/${rel_path}"

  checks=$((checks + 1))
  if [[ -f "${abs_path}" ]]; then
    echo "[OK] ${label}: ${rel_path}"
  else
    echo "[ERROR] ${label}: missing ${rel_path}"
    failures=$((failures + 1))
  fi
}

check_pattern() {
  local rel_path="$1"
  local pattern="$2"
  local label="$3"
  local abs_path="${TARGET_DIR}/${rel_path}"

  checks=$((checks + 1))
  if [[ ! -f "${abs_path}" ]]; then
    echo "[ERROR] ${label}: missing ${rel_path}"
    failures=$((failures + 1))
    return
  fi

  if has_pattern "${pattern}" "${abs_path}"; then
    echo "[OK] ${label}"
  else
    echo "[ERROR] ${label}: pattern not found -> ${pattern}"
    failures=$((failures + 1))
  fi
}

check_recursive_pattern() {
  local rel_dir="$1"
  local pattern="$2"
  local label="$3"
  local abs_dir="${TARGET_DIR}/${rel_dir}"

  checks=$((checks + 1))
  if [[ ! -d "${abs_dir}" ]]; then
    echo "[ERROR] ${label}: missing directory ${rel_dir}"
    failures=$((failures + 1))
    return
  fi

  if command -v rg >/dev/null 2>&1; then
    if rg -Fq -- "${pattern}" "${abs_dir}"; then
      echo "[OK] ${label}"
    else
      echo "[ERROR] ${label}: pattern not found -> ${pattern}"
      failures=$((failures + 1))
    fi
    return
  fi

  if grep -RFq -- "${pattern}" "${abs_dir}"; then
    echo "[OK] ${label}"
  else
    echo "[ERROR] ${label}: pattern not found -> ${pattern}"
    failures=$((failures + 1))
  fi
}

echo "[INFO] Admin console P0 verification target: ${TARGET_DIR}"

required_files=(
  "src/app/api/admin/users/route.ts::ADMIN users list API"
  "src/app/api/admin/users/[id]/route.ts::ADMIN user patch API"
  "src/app/api/admin/courses/route.ts::ADMIN courses list API"
  "src/app/api/admin/courses/[id]/route.ts::ADMIN course patch API"
  "src/app/api/admin/stats/route.ts::ADMIN stats API"
  "src/lib/audit.ts::Audit helper"
  "src/__tests__/api/admin.test.ts::Admin API tests"
  "prisma/schema.prisma::Prisma schema"
)

for entry in "${required_files[@]}"; do
  rel_path="${entry%%::*}"
  label="${entry##*::}"
  check_file "${rel_path}" "${label}"
done

# Route-level ADMIN role checks (middleware bypass prevention)
check_pattern "src/app/api/admin/users/route.ts" 'session.user.role !== "ADMIN"' "users route has explicit ADMIN guard"
check_pattern "src/app/api/admin/users/[id]/route.ts" 'session.user.role !== "ADMIN"' "user patch route has explicit ADMIN guard"
check_pattern "src/app/api/admin/courses/route.ts" 'session.user.role !== "ADMIN"' "courses route has explicit ADMIN guard"
check_pattern "src/app/api/admin/courses/[id]/route.ts" 'session.user.role !== "ADMIN"' "course patch route has explicit ADMIN guard"
check_pattern "src/app/api/admin/stats/route.ts" 'session.user.role !== "ADMIN"' "stats route has explicit ADMIN guard"

# Pagination checks for large datasets (users/courses)
check_pattern "src/app/api/admin/users/route.ts" 'searchParams.get("page")' "users API parses page"
check_pattern "src/app/api/admin/users/route.ts" 'searchParams.get("pageSize")' "users API parses pageSize"
check_pattern "src/app/api/admin/users/route.ts" "skip: (page - 1) * pageSize" "users API applies skip pagination"
check_pattern "src/app/api/admin/users/route.ts" "take: pageSize" "users API applies take pagination"
check_pattern "src/app/api/admin/courses/route.ts" 'searchParams.get("page")' "courses API parses page"
check_pattern "src/app/api/admin/courses/route.ts" 'searchParams.get("pageSize")' "courses API parses pageSize"
check_pattern "src/app/api/admin/courses/route.ts" "skip: (page - 1) * pageSize" "courses API applies skip pagination"
check_pattern "src/app/api/admin/courses/route.ts" "take: pageSize" "courses API applies take pagination"

# Destructive action audit logging checks
check_pattern "src/app/api/admin/users/[id]/route.ts" "createAuditLog(" "user patch route writes audit log"
check_pattern "src/app/api/admin/users/[id]/route.ts" 'action: "USER_ROLE_CHANGED"' "user role change audit action exists"
check_pattern "src/app/api/admin/courses/[id]/route.ts" "createAuditLog(" "course patch route writes audit log"
check_pattern "src/app/api/admin/courses/[id]/route.ts" '"COURSE_UNPUBLISHED"' "course unpublish audit action exists"
check_pattern "src/app/api/admin/courses/[id]/route.ts" 'action: "COURSE_DELETED"' "course delete audit action exists"

# Stats API date-range integrity checks
check_pattern "src/app/api/admin/stats/route.ts" "startDate > endDate" "stats API validates inverted date ranges"
check_pattern "src/app/api/admin/stats/route.ts" "rangeDays > 365" "stats API validates max date range"

# Prisma audit schema and migration checks
check_pattern "prisma/schema.prisma" "enum AuditAction" "Prisma enum AuditAction exists"
check_pattern "prisma/schema.prisma" "model AuditLog" "Prisma model AuditLog exists"
check_recursive_pattern "prisma/migrations" "audit_logs" "Prisma migration includes audit_logs table"

# QA coverage checks for 403 and 404 boundaries
check_pattern "src/__tests__/api/admin.test.ts" "returns 403 for non-admin users" "admin tests cover 403"
check_pattern "src/__tests__/api/admin.test.ts" "returns 404 when target user does not exist" "admin tests cover missing user 404"

if [[ ${failures} -gt 0 ]]; then
  echo "[SUMMARY] checks=${checks} failures=${failures} status=FAIL"
  exit 1
fi

echo "[SUMMARY] checks=${checks} failures=0 status=PASS"
