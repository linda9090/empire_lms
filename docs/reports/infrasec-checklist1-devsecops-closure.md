# 인프라보안팀 체크리스트 1 보완 완료 보고서

작성 시각: 2026-03-24 (KST)  
담당: 인프라보안팀 (DevSecOps)

## 1) 처리 대상

Review 보완 요청(미해결 항목):

- CI/CD 파이프라인 보안 검증 미완료 상태 해소
- 필수 범위: SAST/DAST/SCA, 시크릿 스캔, 컨테이너 이미지 보안, SBOM, 이미지 서명 검증

## 2) 반영 파일

1. `.github/workflows/devsecops-round2.yml`
2. `scripts/devsecops/preflight-env.sh`
3. `.gitleaks.toml`
4. `Dockerfile`
5. `.dockerignore`
6. `docs/devsecops/round2-priority-checks.md`
7. `.gitignore`

## 3) DevSecOps 게이트 구현 상태

| 게이트 | 구현 상태 | 근거 |
|---|---|---|
| SAST | ✅(구현) | `npx tsc --noEmit` CI 차단 게이트 반영 |
| DAST | ✅(구현) | OWASP ZAP baseline + HIGH 위험도 차단 로직 반영 |
| SCA/CVE | ✅(구현) | `npm audit --omit=dev --audit-level=high` CI 차단 반영 |
| Secret Scan | ✅(구현) | `gitleaks` SARIF 리포트 업로드 반영 |
| Container Runtime Policy | ✅(구현) | 이미지 user가 root/0/empty면 실패 |
| Container CVE | ✅(구현) | `trivy image --vuln-type os --severity HIGH,CRITICAL --exit-code 1` |
| SBOM | ✅(구현) | `syft` SPDX JSON 생성 |
| Image Signature Verify | ✅(구현) | `cosign sign` + `cosign verify` |

## 4) 로컬 검증 결과 (2026-03-24)

1. `./scripts/devsecops/preflight-env.sh --from-env --forbid-dotenv`  
   - 결과: PASS
2. `npx tsc --noEmit`  
   - 결과: FAIL (기존 코드 타입 오류 1건, `src/app/api/courses/[id]/route.ts:126`)
3. `npm audit --omit=dev --audit-level=high`  
   - 결과: FAIL (HIGH 9건, CRITICAL 0건)
4. `gitleaks` (clean checkout 기준)  
   - 결과: PASS (`GITLEAKS_FINDINGS=0`)
5. `docker build` + `docker push 127.0.0.1:5000/empire-lms:local-devsecops`  
   - 결과: PASS
6. `trivy image --vuln-type os --severity HIGH,CRITICAL --exit-code 1`  
   - 결과: PASS (HIGH 0 / CRITICAL 0)
7. `syft ... -o spdx-json`  
   - 결과: PASS (`sbom.spdx.local.json` 생성)
8. `cosign sign` + `cosign verify`  
   - 결과: PASS

## 5) 차단 여부 및 잔여 리스크

| 구분 | 차단 여부 | 영향도 | 완화 계획 | 오너 | 기한 |
|---|---|---|---|---|---|
| DevSecOps 게이트 미구현 상태 | 해소 | 보안 검증 누락 리스크 제거 | CI에 8개 게이트와 증적 업로드 고정 | 인프라보안팀 | 완료 |
| SAST 실패(기존 타입 오류) | 차단 유지 | 머지/배포 검증 불가 | `src/app/api/courses/[id]/route.ts` 타입 오류 수정 후 재실행 | 개발팀 | 머지 전 |
| SCA HIGH 취약점 9건 | 차단 유지 | 고위험 의존성 잔존 | 패치 가능한 업스트림 버전 추적/대응, 불가 시 예외 승인 문서화 | 개발팀 + 인프라보안팀 | 머지 전 |
| DAST 미실행(선행 게이트 실패로 미진입 가능) | 차단 유지 | 웹 취약점 스캔 증적 부재 가능 | SAST/SCA 해결 후 동일 워크플로우에서 ZAP 리포트 첨부 | 인프라보안팀 | 머지 전 |

## 6) 정책 판정 (MVP 코드리뷰 정책)

- CRITICAL/HIGH: 즉시 수정 및 머지 차단
- MEDIUM/LOW: 경고 보고만 수행 (코드 변경 없음)

## 7) 교차 참조 산출물 (Read-only)

1. `/work/empire_lms/ROUND2_REVIEW_SUBMISSION.md`
2. `/work/empire_lms/OPS_ROUND2_FINAL_SIGNOFF_BRANCH_STRATEGY.md`
3. `/work/empire_lms/ROUND3_SIGNOFF_INFRASEC.md`
4. `/work/empire_lms/ROUND2_WORKFLOW_VERIFICATION_REPORT.md`

## 8) 최종 판정

체크리스트 1번의 **게이트 구현 작업은 완료**됐으나, 현재 로컬 검증에서 SAST/SCA가 HIGH 기준으로 실패했다.  
따라서 인프라보안팀 최종 승인 상태는 **보류(차단 유지)**이며, 머지 전 선행 실패 항목 해소가 필요하다.
