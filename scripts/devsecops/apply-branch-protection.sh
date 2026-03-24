#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-linda9090/empire_lms}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DEVELOP_BRANCH="${DEVELOP_BRANCH:-develop}"
REQUIRED_APPROVALS="${REQUIRED_APPROVALS:-2}"

if [[ ! "${REQUIRED_APPROVALS}" =~ ^[0-9]+$ ]]; then
  echo "[ERROR] REQUIRED_APPROVALS must be a positive integer (actual=${REQUIRED_APPROVALS})."
  exit 1
fi

for cmd in gh; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[ERROR] Required command not found: ${cmd}"
    exit 1
  fi
done

if ! gh auth status >/dev/null 2>&1; then
  echo "[ERROR] GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

contexts_json='["merge-gate / lint","merge-gate / test","merge-gate / build","devsecops-round2 / verify"]'

build_payload() {
  cat <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ${contexts_json}
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": ${REQUIRED_APPROVALS}
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
}

apply_rule() {
  local branch="$1"
  local payload

  payload="$(build_payload)"

  echo "[INFO] Applying branch protection to ${REPO}:${branch}"
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/${REPO}/branches/${branch}/protection" \
    --input - >/dev/null <<<"${payload}"

  gh api "repos/${REPO}/branches/${branch}/protection" \
    --jq '{branch:.url,approvals:.required_pull_request_reviews.required_approving_review_count,contexts:.required_status_checks.contexts,enforce_admins:.enforce_admins.enabled,force_push:.allow_force_pushes.enabled,deletions:.allow_deletions.enabled,conversation_resolution:.required_conversation_resolution.enabled}'
}

apply_rule "${MAIN_BRANCH}"
apply_rule "${DEVELOP_BRANCH}"

echo "[OK] Branch protection rules applied successfully."
