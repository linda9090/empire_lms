#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-linda9090/empire_lms}"
REQUIRED_APPROVALS="${REQUIRED_APPROVALS:-2}"

required_contexts=(
  "merge-gate / lint"
  "merge-gate / test"
  "merge-gate / build"
  "devsecops-round2 / verify"
)

failures=0

ok() {
  echo "[OK] $*"
}

fail() {
  echo "[FAIL] $*"
  failures=$((failures + 1))
}

for cmd in gh; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[ERROR] Required command not found: ${cmd}"
    exit 2
  fi
done

if [[ ! "${REQUIRED_APPROVALS}" =~ ^[0-9]+$ ]]; then
  echo "[ERROR] REQUIRED_APPROVALS must be a positive integer (actual=${REQUIRED_APPROVALS})."
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "[ERROR] GitHub CLI is not authenticated. Run: gh auth login"
  exit 2
fi

check_branch() {
  local branch="$1"

  if ! gh api "repos/${REPO}/branches/${branch}/protection" >/dev/null 2>&1; then
    fail "${branch}: branch protection is missing."
    return
  fi

  approvals="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.required_pull_request_reviews.required_approving_review_count // -1' 2>/dev/null || echo -1)"
  if [[ "${approvals}" =~ ^[0-9]+$ ]] && [[ "${approvals}" -ge "${REQUIRED_APPROVALS}" ]]; then
    ok "${branch}: approvals >= ${REQUIRED_APPROVALS} (actual=${approvals})."
  else
    fail "${branch}: approvals below ${REQUIRED_APPROVALS} (actual=${approvals})."
  fi

  pr_required="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '(.required_pull_request_reviews != null)' 2>/dev/null || echo false)"
  if [[ "${pr_required}" == "true" ]]; then
    ok "${branch}: pull request before merge is enabled."
  else
    fail "${branch}: pull request before merge is not enabled."
  fi

  strict="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.required_status_checks.strict // false' 2>/dev/null || echo false)"
  if [[ "${strict}" == "true" ]]; then
    ok "${branch}: strict status checks are enabled."
  else
    fail "${branch}: strict status checks are not enabled."
  fi

  contexts="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.required_status_checks.contexts[]?' 2>/dev/null || true)"
  for ctx in "${required_contexts[@]}"; do
    if grep -Fxq "${ctx}" <<<"${contexts}"; then
      ok "${branch}: required check exists (${ctx})."
    else
      fail "${branch}: missing required check (${ctx})."
    fi
  done

  enforce_admins="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.enforce_admins.enabled // false' 2>/dev/null || echo false)"
  if [[ "${enforce_admins}" == "true" ]]; then
    ok "${branch}: admin bypass is disabled."
  else
    fail "${branch}: admin bypass is enabled."
  fi

  force_push="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.allow_force_pushes.enabled' 2>/dev/null || echo "__error__")"
  if [[ "${force_push}" == "false" ]]; then
    ok "${branch}: force push is disabled."
  else
    fail "${branch}: force push is enabled."
  fi

  deletions="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.allow_deletions.enabled' 2>/dev/null || echo "__error__")"
  if [[ "${deletions}" == "false" ]]; then
    ok "${branch}: deletion is disabled."
  else
    fail "${branch}: deletion is enabled."
  fi

  conversation_resolution="$(gh api "repos/${REPO}/branches/${branch}/protection" --jq '.required_conversation_resolution.enabled // false' 2>/dev/null || echo false)"
  if [[ "${conversation_resolution}" == "true" ]]; then
    ok "${branch}: conversation resolution is required."
  else
    fail "${branch}: conversation resolution requirement is missing."
  fi
}

check_branch "main"
check_branch "develop"

echo "[SUMMARY] failures=${failures}"
if [[ ${failures} -gt 0 ]]; then
  exit 1
fi

exit 0
