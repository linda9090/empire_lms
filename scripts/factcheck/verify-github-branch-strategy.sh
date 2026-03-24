#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-linda9090/empire_lms}"
EXPECTED_REMOTE_URL="${2:-https://github.com/linda9090/empire_lms.git}"
TARGET_ISSUE_TITLE="[chore] GitHub 원격 저장소 연결 및 브랜치 보호 규칙 설정"
WORKFLOW_HEAD_BRANCH="feature/#2-test-workflow"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

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
  echo "[FAIL] $*"
  failures=$((failures + 1))
}

for required_cmd in git gh awk grep; do
  if ! command -v "${required_cmd}" >/dev/null 2>&1; then
    fail "Required command not found: ${required_cmd}"
  fi
done

if [[ ${failures} -gt 0 ]]; then
  echo "[SUMMARY] failures=${failures}, warnings=${warnings}"
  exit 2
fi

if gh auth status >/dev/null 2>&1; then
  ok "GitHub CLI authentication is valid."
else
  fail "GitHub CLI is not authenticated."
fi

origin_url="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "${origin_url}" ]]; then
  fail "git remote origin is missing."
elif [[ "${origin_url}" == "${EXPECTED_REMOTE_URL}" ]]; then
  ok "origin remote URL matches expected repository."
else
  fail "origin remote URL mismatch. expected=${EXPECTED_REMOTE_URL}, actual=${origin_url}"
fi

main_sha="$(git ls-remote --heads origin main 2>/dev/null | awk '{print $1}')"
develop_sha="$(git ls-remote --heads origin develop 2>/dev/null | awk '{print $1}')"

if [[ -n "${main_sha}" ]]; then
  ok "Remote branch main exists (${main_sha:0:7})."
else
  fail "Remote branch main is missing."
fi

if [[ -n "${develop_sha}" ]]; then
  ok "Remote branch develop exists (${develop_sha:0:7})."
else
  fail "Remote branch develop is missing."
fi

if main_approvals="$(gh api "repos/${REPO}/branches/main/protection" --jq '.required_pull_request_reviews.required_approving_review_count' 2>/dev/null)"; then
  if [[ "${main_approvals}" =~ ^[0-9]+$ ]] && [[ "${main_approvals}" -ge 1 ]]; then
    ok "main requires >=1 approving review."
  else
    fail "main approval requirement is below 1 (actual=${main_approvals})."
  fi
else
  fail "main branch protection rule is missing."
fi

if main_contexts="$(gh api "repos/${REPO}/branches/main/protection" --jq '.required_status_checks.contexts[]?' 2>/dev/null)"; then
  if grep -Fxq "TypeScript Build" <<<"${main_contexts}"; then
    ok "main requires TypeScript Build status check."
  else
    fail "main does not require TypeScript Build status check."
  fi
else
  fail "Unable to read main required status checks."
fi

if main_enforce_admins="$(gh api "repos/${REPO}/branches/main/protection" --jq '.enforce_admins.enabled' 2>/dev/null)"; then
  if [[ "${main_enforce_admins}" == "true" ]]; then
    ok "main bypass is disabled for admins."
  else
    fail "main bypass is allowed for admins."
  fi
else
  fail "Unable to read main admin enforcement rule."
fi

if main_force_push="$(gh api "repos/${REPO}/branches/main/protection" --jq '.allow_force_pushes.enabled' 2>/dev/null)"; then
  if [[ "${main_force_push}" == "false" ]]; then
    ok "main force-push is disabled."
  else
    fail "main force-push is enabled."
  fi
else
  fail "Unable to read main force-push rule."
fi

if main_deletions="$(gh api "repos/${REPO}/branches/main/protection" --jq '.allow_deletions.enabled' 2>/dev/null)"; then
  if [[ "${main_deletions}" == "false" ]]; then
    ok "main deletion is disabled."
  else
    fail "main deletion is enabled."
  fi
else
  fail "Unable to read main deletion rule."
fi

if develop_pr_required="$(gh api "repos/${REPO}/branches/develop/protection" --jq '.required_pull_request_reviews != null' 2>/dev/null)"; then
  if [[ "${develop_pr_required}" == "true" ]]; then
    ok "develop requires pull requests before merge."
  else
    fail "develop does not enforce pull-request-only merge."
  fi
else
  fail "develop branch protection rule is missing."
fi

if develop_contexts="$(gh api "repos/${REPO}/branches/develop/protection" --jq '.required_status_checks.contexts[]?' 2>/dev/null)"; then
  if grep -Fxq "TypeScript Build" <<<"${develop_contexts}"; then
    ok "develop requires TypeScript Build status check."
  else
    fail "develop does not require TypeScript Build status check."
  fi
else
  fail "Unable to read develop required status checks."
fi

if develop_force_push="$(gh api "repos/${REPO}/branches/develop/protection" --jq '.allow_force_pushes.enabled' 2>/dev/null)"; then
  if [[ "${develop_force_push}" == "false" ]]; then
    ok "develop force-push is disabled."
  else
    fail "develop force-push is enabled."
  fi
else
  fail "Unable to read develop force-push rule."
fi

label_names="$(gh label list -R "${REPO}" --limit 200 --json name --jq '.[].name' 2>/dev/null || true)"
if [[ -z "${label_names}" ]]; then
  fail "Unable to read labels from ${REPO}."
else
  missing_labels=()
  required_labels=(
    "type:feat"
    "type:fix"
    "type:refactor"
    "type:chore"
    "type:docs"
    "type:test"
    "scope:auth"
    "scope:course"
    "scope:activity"
    "scope:pdf"
    "scope:payment"
    "scope:analytics"
    "scope:lti"
    "scope:api"
    "scope:ui"
    "scope:db"
    "priority:high"
    "priority:medium"
    "priority:low"
  )

  for label in "${required_labels[@]}"; do
    if ! grep -Fxq "${label}" <<<"${label_names}"; then
      missing_labels+=("${label}")
    fi
  done

  if [[ ${#missing_labels[@]} -eq 0 ]]; then
    ok "All required 19 governance labels exist."
  else
    fail "Missing governance labels: ${missing_labels[*]}"
  fi
fi

target_issue_number="$(gh issue list -R "${REPO}" --state all --json number,title --jq ".[] | select(.title==\"${TARGET_ISSUE_TITLE}\") | .number" | head -n 1)"
if [[ -n "${target_issue_number}" ]]; then
  ok "Target issue exists (#${target_issue_number})."
  issue_labels="$(gh issue view "${target_issue_number}" -R "${REPO}" --json labels --jq '.labels[].name' 2>/dev/null || true)"
  if grep -Fxq "type:chore" <<<"${issue_labels}" && grep -Fxq "priority:high" <<<"${issue_labels}"; then
    ok "Target issue has required labels (type:chore, priority:high)."
  else
    fail "Target issue labels are incomplete."
  fi

  issue_assignees="$(gh issue view "${target_issue_number}" -R "${REPO}" --json assignees --jq '.assignees[].login' 2>/dev/null || true)"
  if grep -Eiq '^alex([_-].*)?$' <<<"${issue_assignees}"; then
    ok "Target issue assignee is mapped to Alex account."
  else
    warn "Target issue assignee is not mapped to Alex login (actual: ${issue_assignees:-<none>})."
  fi
else
  fail "Target issue title not found: ${TARGET_ISSUE_TITLE}"
fi

workflow_pr_number="$(gh pr list -R "${REPO}" --state all --json number,headRefName,baseRefName --jq ".[] | select(.headRefName==\"${WORKFLOW_HEAD_BRANCH}\" and .baseRefName==\"develop\") | .number" | head -n 1)"
if [[ -n "${workflow_pr_number}" ]]; then
  ok "Workflow PR exists for ${WORKFLOW_HEAD_BRANCH} -> develop (PR #${workflow_pr_number})."
  workflow_pr_state="$(gh pr view "${workflow_pr_number}" -R "${REPO}" --json state,mergedAt,body --jq '.state')"
  workflow_pr_merged_at="$(gh pr view "${workflow_pr_number}" -R "${REPO}" --json state,mergedAt,body --jq '.mergedAt')"
  workflow_pr_body="$(gh pr view "${workflow_pr_number}" -R "${REPO}" --json state,mergedAt,body --jq '.body')"

  if [[ "${workflow_pr_state}" == "MERGED" ]] && [[ "${workflow_pr_merged_at}" != "null" ]]; then
    ok "Workflow PR is merged."
  else
    fail "Workflow PR is not merged (state=${workflow_pr_state}, mergedAt=${workflow_pr_merged_at})."
  fi

  if grep -Fq "Closes #2" <<<"${workflow_pr_body}"; then
    ok "Workflow PR body contains Closes #2."
  else
    fail "Workflow PR body does not contain Closes #2."
  fi
else
  fail "Workflow PR missing: expected head=${WORKFLOW_HEAD_BRANCH}, base=develop."
fi

if gh api "repos/${REPO}/contents/WORKFLOW_TEST.md?ref=develop" >/dev/null 2>&1; then
  ok "WORKFLOW_TEST.md exists in develop."
else
  fail "WORKFLOW_TEST.md is missing in develop."
fi

if issue_two_kind="$(gh api "repos/${REPO}/issues/2" --jq 'if has("pull_request") then "pr" else "issue" end' 2>/dev/null)"; then
  if [[ "${issue_two_kind}" == "issue" ]]; then
    issue_two_state="$(gh api "repos/${REPO}/issues/2" --jq '.state' 2>/dev/null)"
    if [[ "${issue_two_state}" == "closed" ]]; then
      ok "Issue #2 is closed."
    else
      fail "Issue #2 exists but is not closed (state=${issue_two_state})."
    fi
  else
    fail "Number #2 is a pull request, not an issue. Closes #2 cannot satisfy the issue-closure requirement."
  fi
else
  fail "Issue #2 is not reachable via API."
fi

if workflow_issue_state="$(gh issue view 3 -R "${REPO}" --json title,state --jq '.title + "\t" + .state' 2>/dev/null || true)"; then
  if [[ -n "${workflow_issue_state}" ]]; then
    workflow_issue_title="$(awk -F '\t' '{print $1}' <<<"${workflow_issue_state}")"
    workflow_issue_status="$(awk -F '\t' '{print $2}' <<<"${workflow_issue_state}")"
    if [[ "${workflow_issue_title}" == *"워크플로우 검증"* ]] && [[ "${workflow_issue_status}" == "OPEN" ]]; then
      fail "Workflow validation issue remains open (#3)."
    fi
  fi
fi

echo "[SUMMARY] failures=${failures}, warnings=${warnings}"
if [[ ${failures} -gt 0 ]]; then
  exit 1
fi

exit 0
