#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

high=0
medium=0
low=0

pass() {
  echo "[PASS] $*"
}

fail_high() {
  echo "[HIGH] $*"
  high=$((high + 1))
}

warn_medium() {
  echo "[MEDIUM] $*"
  medium=$((medium + 1))
}

warn_low() {
  echo "[LOW] $*"
  low=$((low + 1))
}

courses_id_route="src/app/api/courses/[id]/route.ts"
courses_route="src/app/api/courses/route.ts"

if [[ ! -f "${courses_id_route}" || ! -f "${courses_route}" ]]; then
  fail_high "Required course API route files are missing."
fi

if rg -n "allow any TEACHER or ADMIN" "${courses_id_route}" >/dev/null 2>&1; then
  fail_high "Legacy teacher bypass comment remains in ${courses_id_route}."
else
  pass "Legacy teacher bypass comment removed."
fi

ownership_guard_count="$(rg -n "existingCourse\\.teacherId !== session\\.user\\.id" "${courses_id_route}" | wc -l | tr -d ' ')"
if [[ "${ownership_guard_count}" -ge 2 ]]; then
  pass "Teacher ownership guard is present for both update and delete handlers."
else
  fail_high "Teacher ownership guard is missing in one or more handlers."
fi

if rg -n "teacherId: session\\.user\\.id" "${courses_route}" >/dev/null 2>&1; then
  pass "Course creation stores teacher ownership."
else
  fail_high "Course creation does not persist teacher ownership."
fi

if rg -n "PaymentProvider|stripe|paypal" src/app/api/enrollments/route.ts >/dev/null 2>&1; then
  warn_medium "Enrollment route references payment provider terms. Verify direct payment API usage policy."
else
  pass "Enrollment route has no direct payment provider references."
fi

if npm run test -- src/__tests__/api/courses.test.ts src/__tests__/api/enrollments.test.ts; then
  pass "Course and enrollment regression tests passed."
else
  fail_high "Course/enrollment regression test suite failed."
fi

if [[ ${medium} -gt 0 ]]; then
  warn_low "Medium findings require follow-up report only (no code change per policy)."
fi

echo "[SUMMARY] critical=0 high=${high} medium=${medium} low=${low}"

if [[ ${high} -gt 0 ]]; then
  exit 1
fi

