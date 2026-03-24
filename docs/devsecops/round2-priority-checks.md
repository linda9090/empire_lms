# DevSecOps P0 Gate Closure Checklist

## Scope

This checklist closes the unresolved Round 1 merge-blocking item from Infrastructure Security review:

1. SAST gate in CI
2. DAST gate in CI
3. Dependency/CVE (SCA) gate in CI
4. Secret scanning gate in CI
5. Container image security gate in CI (base/runtime)
6. SBOM generation gate in CI
7. Image signing verification gate in CI
8. Issue #5 API Contract regression gate in CI

Primary workflows:

- `.github/workflows/devsecops-round2.yml` (security gates)
- `.github/workflows/merge-gate.yml` (merge quality gates)

## CI Gate Matrix (Blocking)

| Gate | Tooling | Fail Condition |
|---|---|---|
| SAST | `npx tsc --noEmit` | Any compile/type-safety failure |
| DAST | `OWASP ZAP baseline` | Any HIGH-risk finding |
| Dependency/CVE (SCA) | `npm audit --omit=dev --audit-level=high` | High/Critical dependency CVE detected |
| Secret scan | `gitleaks` | Any detected credential/secret leak |
| Container runtime policy | `docker image inspect` | Image user is `root`/`0`/empty |
| Container CVE | `trivy image --vuln-type os --severity HIGH,CRITICAL --exit-code 1` | High/Critical container vulnerability detected |
| SBOM | `syft` SPDX JSON export | SBOM generation failure |
| Image signing verification | `cosign sign` + `cosign verify` | Signature creation or verification failure |
| API Contract regression (Issue #5) | `scripts/devsecops/verify-api-contract.sh` + focused Vitest suite | `courses/enrollments/curriculum` API contract regression test fails or required route file is missing |

## Merge Quality Gate Matrix (Blocking)

| Gate | Workflow Context | Fail Condition |
|---|---|---|
| Lint | `merge-gate / lint` | `npm run lint` non-zero exit |
| Test | `merge-gate / test` | `npm run test` non-zero exit |
| Build | `merge-gate / build` | `npx tsc --noEmit` or `npm run build` non-zero exit |

## Branch Protection Baseline (main + develop)

1. Pull request before merge: ON
2. Required approving reviews: 2+
3. Required status checks (strict): ON
4. Required contexts:
   - `merge-gate / lint`
   - `merge-gate / test`
   - `merge-gate / build`
   - `devsecops-round2 / verify`
5. Do not allow bypassing above settings: ON
6. Allow force pushes: OFF
7. Allow deletions: OFF

Automation scripts:

```bash
./scripts/devsecops/apply-branch-protection.sh linda9090/empire_lms
./scripts/devsecops/verify-branch-protection.sh linda9090/empire_lms
```

## Required PR Evidence

Attach CI artifact bundle `devsecops-round2-artifacts` containing:

1. `artifacts/security/npm-audit.json`
2. `artifacts/security/gitleaks.sarif`
3. `artifacts/security/zap-report.json`
4. `artifacts/security/zap-report.md`
5. `artifacts/security/container-runtime-user.txt`
6. `artifacts/security/trivy-image.json`
7. `artifacts/security/sbom.spdx.json`
8. `artifacts/security/cosign-verify.json`

## Severity Policy (MVP Code Review Policy)

- CRITICAL/HIGH: immediate fix required, merge blocked
- MEDIUM/LOW: warning report only, tracked as follow-up item

## Cross-Team Alignment (Read-only References)

This closure format is aligned with prior deliverables from other teams:

1. `/work/empire_lms/ROUND2_REVIEW_SUBMISSION.md`
2. `/work/empire_lms/OPS_ROUND2_FINAL_SIGNOFF_BRANCH_STRATEGY.md`
3. `/work/empire_lms/ROUND3_SIGNOFF_INFRASEC.md`
4. `/work/empire_lms/ROUND2_WORKFLOW_VERIFICATION_REPORT.md`
