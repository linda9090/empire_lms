# 브랜치 보호 규칙 검토 요청
**Request For:** 인프라보안팀 (볼트S/파이프)
**From:** 기획팀 (클리오)
**Date:** 2026-03-24
**Priority:** HIGH
**Related:** Issue #5 코드 유실 사건 재발 방지

---

## 배경

이슈 #5 작업 코드가 "사라진 것"으로 보고되었으나, 실제로는 develop 브랜치에 존재하는 것으로 확인되었습니다. 이번 사건을 계기로 **브랜치 보호 규칙**을 점검하고 재발 방지 조치를 취하고자 합니다.

---

## 검토 요청 항목

### 1. GitHub 브랜치 보호 규칙 현황 확인

다음 항목들에 대해 현재 설정 상태를 확인해 주십시오:

| 설정 항목 | 현재 상태 | 권장 값 | 비고 |
|----------|----------|---------|------|
| 강제 푸시 금지 (force push) | [ ] 예 / [ ] 아니오 | ✅ 예 | main 브랜치 |
| PR 필수 (require pull request) | [ ] 예 / [ ] 아니오 | ✅ 예 | main 브랜치 |
| 리뷰어 수 최소 (required reviewers) | [ ] ___ 인 | ✅ 2인 이상 | main 브랜치 |
| 리뷰어 승인 후 머지 가능 (dismiss stale reviews) | [ ] 예 / [ ] 아니오 | ✅ 예 | main 브랜치 |
| 커밋 직접 머지 금지 | [ ] 예 / [ ] 아니오 | ✅ 예 | main 브랜치 |
| CI/CD 통과 필수 (status checks) | [ ] 예 / [ ] 아니오 | ✅ 예 | main 브랜치 |

### 2. develop 브랜치 보호 규칙 검토

develop 브랜치에 대해서도 동일한 보호 규칙 적용이 필요한지 검토해 주십시오.

### 3. 코드 유실 원인 규명

다음 가능한 원인들에 대해 근본 원인 분석을 부탁드립니다:

| 가능 원인 | 확인 필요 항목 |
|----------|---------------|
| 강제 푸시 (git push --force) | reflog에서 force push 흔적 확인 |
| 브랜치 삭제 (git branch -D) | 삭제된 브랜치 복구 가능성 확인 |
| 미설정된 branch protection | 현재 보호 규칙 설정 상태 |
| 실수로 잘못된 브랜치에서 작업 | worktree/branch 사용 패턴 검토 |

---

## 조치 요청

### [높음] 즉시 조치 필요

1. **main 브랜치 보호 규칙 설정**
   - 강제 푸시 금지
   - PR 필수
   - 리뷰어 최소 2인 승인
   - CI/CD 통과 필수

2. **develop 브랜치 보호 규칙 설정**
   - main과 동일 수준 또는 적절히 완화된 규칙

### [중간] 검토 후 조치

3. **코드 유실 원인 최종 보고**
   - 근본 원인 분석 결과
   - 재발 방지를 위한 추가 권장사항

4. **복구 경로 별 검증 체크리스트 작성**
   - reflog → 복구
   - fsck → 복구
   - cherry-pick → 복구

---

## GitHub 설정 명령어 참조

```bash
# gh CLI로 브랜치 보호 설정
gh api \
  repos/:owner/:repo/branches/main/protection \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -f enforce_admins=true \
  -f allow_deletions=false \
  -f allow_force_pushes=false \
  -f required_pull_request_reviews='{
      "required_approving_review_count": 2,
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false
    }' \
  -f required_status_checks='{
      "strict": true,
      "contexts": ["ci/test", "ci/lint"]
    }' \
  -f restrictions=null
```

---

## 기대 산출물

1. 현재 브랜치 보호 규칙 현황 보고서
2. 설정된 보호 규칙 적용 증거 (스크린샷 또는 API 응답)
3. 코드 유실 원인 최종 분석 보고서
4. 복구 체크리스트 문서

---

## 기한

**2026-03-24 24:00까지** 초안 보고

---

## 연락처

- 요청자: 기획팀 클리오
- 협조: CEO Office

---

**기획팀 클리오**
**2026-03-24**
