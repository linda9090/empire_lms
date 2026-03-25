#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-.}"
RUN_TSC="${RUN_TSC:-1}"

if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "[ERROR] Target directory not found: ${TARGET_DIR}"
  exit 1
fi

TARGET_DIR="$(cd "${TARGET_DIR}" && pwd)"

checks=0
failures=0
warnings=0

ok() {
  echo "[OK] $*"
}

warn() {
  echo "[WARN] $*"
  warnings=$((warnings + 1))
}

fail() {
  echo "[ERROR] $*"
  failures=$((failures + 1))
}

check_file() {
  local rel_path="$1"
  local label="$2"
  local abs_path="${TARGET_DIR}/${rel_path}"

  checks=$((checks + 1))
  if [[ -f "${abs_path}" ]]; then
    ok "${label}: ${rel_path}"
  else
    fail "${label}: missing ${rel_path}"
  fi
}

count_grep_matches() {
  local pattern="$1"
  local dir="$2"

  if [[ ! -d "${dir}" ]]; then
    echo "0"
    return
  fi

  {
    grep -rno --include="*.tsx" "${pattern}" "${dir}" 2>/dev/null || true
  } | wc -l | tr -d "[:space:]"
}

count_code_matches() {
  local pattern="$1"
  shift
  local paths=("$@")

  if command -v rg >/dev/null 2>&1; then
    {
      rg -n --glob "*.ts" --glob "*.tsx" "${pattern}" "${paths[@]}" 2>/dev/null || true
    } | wc -l | tr -d "[:space:]"
    return
  fi

  {
    grep -RnoE --include="*.ts" --include="*.tsx" "${pattern}" "${paths[@]}" 2>/dev/null || true
  } | wc -l | tr -d "[:space:]"
}

print_samples() {
  local pattern="$1"
  local dir="$2"
  local label="$3"

  echo "[INFO] ${label} sample (up to 10):"
  grep -rn --include="*.tsx" "${pattern}" "${dir}" 2>/dev/null | head -n 10 || true
}

echo "[INFO] InfraSec token rollout verification target: ${TARGET_DIR}"

required_files=(
  "src/lib/tokens.ts::Token source file"
  "src/lib/chartColors.ts::Chart color token file"
  "src/app/globals.css::Global CSS variable file"
  "tailwind.config.ts::Tailwind config with colors.role"
)

for entry in "${required_files[@]}"; do
  rel_path="${entry%%::*}"
  label="${entry##*::}"
  check_file "${rel_path}" "${label}"
done

checks=$((checks + 1))
if [[ -f "${TARGET_DIR}/tailwind.config.ts" ]]; then
  if grep -Eq "colors[[:space:]]*:" "${TARGET_DIR}/tailwind.config.ts" && grep -Eq "role[[:space:]]*:" "${TARGET_DIR}/tailwind.config.ts"; then
    ok "tailwind.config.ts includes colors/role tokens"
  else
    fail "tailwind.config.ts does not include expected colors.role settings"
  fi
else
  fail "tailwind.config.ts not found; cannot verify colors.role settings"
fi

target_files=(
  "src/components/shared/ShellLayout.tsx"
  "src/components/shared/SidebarNav.tsx"
  "src/components/shared/SidebarNavItem.tsx"
  "src/components/shared/Header.tsx"
  "src/components/shared/RoleBadge.tsx"
  "src/components/shared/NotificationBell.tsx"
  "src/app/(auth)/login/page.tsx"
  "src/app/(auth)/register/page.tsx"
  "src/app/(auth)/layout.tsx"
  "src/app/unauthorized/page.tsx"
  "src/app/(teacher)/teacher/dashboard/page.tsx"
  "src/app/(student)/student/dashboard/page.tsx"
  "src/app/(guardian)/guardian/dashboard/page.tsx"
  "src/app/(admin)/admin/dashboard/page.tsx"
  "src/app/(teacher)/teacher/courses/page.tsx"
  "src/app/(teacher)/teacher/courses/new/page.tsx"
  "src/app/(teacher)/teacher/courses/[id]/edit/page.tsx"
  "src/app/(student)/student/courses/page.tsx"
  "src/app/(student)/student/courses/[id]/page.tsx"
  "src/app/(teacher)/teacher/courses/[id]/curriculum/page.tsx"
  "src/app/(student)/student/courses/[id]/learn/page.tsx"
  "src/app/(student)/student/enrollments/page.tsx"
  "src/app/(student)/student/progress/page.tsx"
  "src/app/(teacher)/teacher/students/page.tsx"
  "src/app/(student)/student/courses/[id]/checkout/page.tsx"
  "src/app/(teacher)/teacher/courses/[id]/invite/page.tsx"
  "src/app/(teacher)/teacher/invitations/page.tsx"
  "src/app/(guardian)/guardian/connect/page.tsx"
  "src/app/(guardian)/guardian/children/page.tsx"
  "src/app/(student)/student/invite/accept/page.tsx"
  "src/app/(teacher)/teacher/notifications/page.tsx"
  "src/app/(student)/student/notifications/page.tsx"
  "src/app/(guardian)/guardian/notifications/page.tsx"
  "src/app/(admin)/admin/notifications/page.tsx"
  "src/app/(admin)/admin/users/page.tsx"
  "src/app/(admin)/admin/courses/page.tsx"
  "src/app/(admin)/admin/stats/page.tsx"
  "src/components/shared/LocaleSwitcher.tsx"
)

for rel_path in "${target_files[@]}"; do
  check_file "${rel_path}" "Target screen/component exists"
done

hex_count="$(count_grep_matches '#[0-9a-fA-F]\{3,6\}' "${TARGET_DIR}/src/app")"
legacy_bg_count="$(count_grep_matches 'bg-green\|bg-blue\|bg-yellow\|bg-gray\|bg-white' "${TARGET_DIR}/src/app")"
strict_bg_count="$(count_grep_matches 'bg-white\|bg-gray-50' "${TARGET_DIR}/src/app")"
inline_style_count="$(count_grep_matches 'style={{' "${TARGET_DIR}/src/app")"

checks=$((checks + 1))
if [[ "${hex_count}" == "0" ]]; then
  ok "Hex hardcoding scan passed (src/app): 0"
else
  fail "Hex hardcoding scan failed (src/app): ${hex_count}"
  print_samples '#[0-9a-fA-F]\{3,6\}' "${TARGET_DIR}/src/app" "Hex hardcoding"
fi

checks=$((checks + 1))
if [[ "${legacy_bg_count}" == "0" ]]; then
  ok "Legacy bg utility scan passed (src/app): 0"
else
  fail "Legacy bg utility scan failed (src/app): ${legacy_bg_count}"
  print_samples 'bg-green\|bg-blue\|bg-yellow\|bg-gray\|bg-white' "${TARGET_DIR}/src/app" "Legacy bg utility"
fi

checks=$((checks + 1))
if [[ "${strict_bg_count}" == "0" ]]; then
  ok "bg-white/bg-gray-50 scan passed (src/app): 0"
else
  fail "bg-white/bg-gray-50 scan failed (src/app): ${strict_bg_count}"
  print_samples 'bg-white\|bg-gray-50' "${TARGET_DIR}/src/app" "bg-white/bg-gray-50"
fi

checks=$((checks + 1))
if [[ "${inline_style_count}" == "0" ]]; then
  ok "Inline style scan passed (src/app): 0"
else
  fail "Inline style scan failed (src/app): ${inline_style_count}"
  print_samples 'style={{' "${TARGET_DIR}/src/app" "Inline style"
fi

role_badge_hits="$(count_code_matches 'RoleBadge' "${TARGET_DIR}/src/app" "${TARGET_DIR}/src/components")"
course_status_hits="$(count_code_matches 'getCourseStatusToken' "${TARGET_DIR}/src/app" "${TARGET_DIR}/src/components")"
chart_colors_hits="$(count_code_matches 'CHART_COLORS' "${TARGET_DIR}/src/app" "${TARGET_DIR}/src/components")"

checks=$((checks + 1))
if [[ "${role_badge_hits}" == "0" ]]; then
  fail "RoleBadge usage not found in app/components"
else
  ok "RoleBadge usage found (${role_badge_hits} hits)"
fi

checks=$((checks + 1))
if [[ "${course_status_hits}" == "0" ]]; then
  fail "getCourseStatusToken usage not found in app/components"
else
  ok "getCourseStatusToken usage found (${course_status_hits} hits)"
fi

checks=$((checks + 1))
if [[ "${chart_colors_hits}" == "0" ]]; then
  fail "CHART_COLORS usage not found in app/components"
else
  ok "CHART_COLORS usage found in app/components (${chart_colors_hits} hits)"
fi

if [[ "${RUN_TSC}" == "1" ]]; then
  checks=$((checks + 1))
  if [[ ! -f "${TARGET_DIR}/package.json" ]]; then
    fail "package.json not found; cannot run TypeScript gate"
  else
    if [[ -f "${TARGET_DIR}/prisma/schema.prisma" ]]; then
      if [[ -f "${TARGET_DIR}/prisma.config.ts" ]]; then
        (cd "${TARGET_DIR}" && npx prisma generate --config=prisma.config.ts >/dev/null)
      else
        (cd "${TARGET_DIR}" && npx prisma generate >/dev/null)
      fi
      ok "Prisma client generated before TypeScript gate"
    else
      warn "prisma/schema.prisma missing; skipped prisma generate"
    fi

    if (cd "${TARGET_DIR}" && npx tsc --noEmit >/dev/null); then
      ok "TypeScript gate passed (npx tsc --noEmit)"
    else
      fail "TypeScript gate failed (npx tsc --noEmit)"
    fi
  fi
else
  checks=$((checks + 1))
  warn "TypeScript gate skipped (RUN_TSC=${RUN_TSC})"
fi

status="PASS"
if [[ ${failures} -gt 0 ]]; then
  status="FAIL"
fi

echo "[SUMMARY] checks=${checks} failures=${failures} warnings=${warnings} status=${status}"

if [[ ${failures} -gt 0 ]]; then
  exit 1
fi
