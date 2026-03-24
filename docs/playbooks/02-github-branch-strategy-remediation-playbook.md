# GitHub 원격/브랜치 전략 보완 실행 플레이북 (Review Round 2)

작성일: 2026-03-23 (KST)  
작성 브랜치: `climpire/1e7da6f2`  
작성: 조사전략실 (주노)  
목적: Review Round 1 조건부 승인 항목 5건을 분할 없이 한 흐름으로 완료하고, Round 2 재검토 증적 형식을 고정한다.

---

## 1) 사실 검증 스냅샷 (2026-03-23)

원격 상태를 GitHub CLI로 재검증한 결과:

1. 저장소 존재/접근 가능: `https://github.com/linda9090/empire_lms` (default branch: `main`)
2. 원격 브랜치: `main`, `develop` 둘 다 존재 (`2b51d11` 동일 SHA)
3. 브랜치 보호 규칙: `main`, `develop` 모두 미적용 (`Branch not protected`, HTTP 404)
4. 라벨: 요청된 19종(type 6 + scope 10 + priority 3) 이미 등록됨
5. Issue/PR: 현재 0건 (`gh issue list --state all`, `gh pr list --state all` 결과 비어 있음)
6. 참고 이슈:
   - 담당자 `Alex`는 현재 assignable 계정으로 확인되지 않음 (`/assignees/Alex` 404)
   - 원격 `develop`에 `.github` 템플릿/`scripts/setup-labels.sh` 파일이 없음 (각각 404)
   - 템플릿/라벨 스크립트는 로컬 히스토리 커밋 `9a0f95d`에 존재

판정: 보완 5건 중 1, 2, 4는 "기반 상태 존재", 3, 5는 "미완". 단, #2 이슈 번호 요구사항은 선행 조건 정리가 필요하다.

---

## 2) 선행 게이트 (Step 0)

### Gate 0-A. 이슈 번호 정책 정합

요구사항은 `Issue #2` 기준 PR 닫힘(`Closes #2`)인데, 현재 저장소 Issue가 0건이다.  
따라서 아래 중 하나를 먼저 결정해야 한다.

1. 정책 유지: seed 이슈를 먼저 생성/종결해 목표 이슈를 #2로 맞춤
2. 정책 수정: 현재 번호 체계에 맞춰 목표 이슈를 #1로 승인

권고: 리뷰 지시문과의 충돌을 피하기 위해 `#2` 유지안을 사용한다.

### Gate 0-B. 담당자 계정 매핑

`Alex` 문자열은 GitHub assignee로 직접 매핑되지 않는다.  
실제 계정(login) 확정 후 해당 계정으로 할당한다.

---

## 3) 순차 실행 체크리스트 (중간 분할 금지)

아래 1~5를 같은 작업 흐름에서 연속 실행한다.

### 1. Issue 생성 (요구사항 반영)

#### 실행

```bash
# (선택) #2 강제 정합이 필요하면 seed 이슈 생성 후 종료
gh issue create \
  --repo linda9090/empire_lms \
  --title "[meta] issue-number seed for governance workflow" \
  --label "type:chore" \
  --label "priority:low"

gh issue close 1 \
  --repo linda9090/empire_lms \
  --comment "Seed issue closed to preserve required numbering."

# 목표 이슈 생성 (#2 예상)
gh issue create \
  --repo linda9090/empire_lms \
  --title "[chore] GitHub 원격 저장소 연결 및 브랜치 보호 규칙 설정" \
  --label "type:chore" \
  --label "priority:high" \
  --assignee "<alex_github_login>"
```

#### 완료 기준

1. 목표 이슈 번호가 `#2`인지 확인
2. 제목/라벨/담당자 일치 확인
3. Issue URL을 증적으로 기록

---

### 2. origin 연결 및 main push 검증

#### 실행

```bash
cd /work/empire_lms
git remote -v
git ls-remote --heads origin main
git rev-parse main
```

#### 완료 기준

1. `origin`이 `https://github.com/linda9090/empire_lms.git`로 설정
2. `refs/heads/main` 원격 SHA와 로컬 `main` SHA 일치

#### 불일치 시 조치

```bash
# origin 미연결 시
git remote add origin https://github.com/linda9090/empire_lms.git

# main 원격 헤드 미존재/불일치 시
git branch -M main
git push -u origin main
```

---

### 3. develop 브랜치 생성/푸시 검증

#### 실행

```bash
cd /work/empire_lms
git branch --list develop
git ls-remote --heads origin develop
git rev-parse develop
```

#### 완료 기준

1. 로컬 `develop` 존재
2. 원격 `refs/heads/develop` 존재
3. 원격 SHA와 로컬 `develop` SHA 일치

#### 불일치 시 조치

```bash
# develop 로컬 미존재 시
git checkout -b develop

# develop 원격 미존재/불일치 시
git push -u origin develop
```

---

### 4. main/develop 브랜치 보호 규칙 적용

#### 적용 대상 규칙

`main`
1. Require a pull request before merging: ON
2. Require approvals: 1명 이상
3. Require status checks to pass: ON (`devsecops-round2 / verify` 체크 컨텍스트 권장)
4. Do not allow bypassing above settings: ON
5. Allow force pushes: OFF
6. Allow deletions: OFF

`develop`
1. Require a pull request before merging: ON
2. Require status checks to pass: ON
3. Allow force pushes: OFF

#### 적용 방법 (UI)

1. GitHub 저장소 `Settings` → `Branches` 이동
2. `Add branch protection rule`에서 `main` 규칙 먼저 생성
3. 같은 방식으로 `develop` 규칙 생성
4. 저장 후 아래 검증 명령으로 API 값 일치 확인

#### 검증 명령

```bash
gh api repos/linda9090/empire_lms/branches/main/protection \
  --jq '{approvals:.required_pull_request_reviews.required_approving_review_count,strict:.required_status_checks.strict,contexts:.required_status_checks.contexts,enforce_admins:.enforce_admins.enabled,force_push:.allow_force_pushes.enabled,deletions:.allow_deletions.enabled}'

gh api repos/linda9090/empire_lms/branches/develop/protection \
  --jq '{has_pr_reviews:(.required_pull_request_reviews != null),strict:.required_status_checks.strict,contexts:.required_status_checks.contexts,force_push:.allow_force_pushes.enabled}'
```

#### 완료 기준

1. 두 API 호출이 404 없이 성공
2. 규칙 값이 요구사항과 일치

---

### 5. 라벨 실등록 확인 + feature→develop PR 흐름 검증

#### 5-A. 라벨 확인

```bash
gh label list --repo linda9090/empire_lms --limit 200
```

완료 기준:

1. `type:*` 6개, `scope:*` 10개, `priority:*` 3개 총 19개 존재
2. 필수 라벨명 누락 0건

#### 5-B. feature worktree → PR → merge 검증

```bash
cd /work/empire_lms
git checkout develop
git worktree add ../empire_lms-test "feature/#2-test-workflow"

cd ../empire_lms-test
echo "# workflow test" > WORKFLOW_TEST.md
git add WORKFLOW_TEST.md
git commit -m "chore: verify git worktree and PR workflow (#2)"
git push -u origin "feature/#2-test-workflow"

gh pr create \
  --repo linda9090/empire_lms \
  --base develop \
  --head "feature/#2-test-workflow" \
  --title "[chore] GitHub 원격 저장소 연결 및 브랜치 전략 초기 설정 (#2)" \
  --body "Closes #2"

# 리뷰/체크 통과 후 머지
gh pr merge --repo linda9090/empire_lms --squash --delete-branch

cd /work/empire_lms
git worktree remove ../empire_lms-test
git worktree prune
git pull origin develop
```

완료 기준:

1. PR이 `feature/#2-test-workflow -> develop`로 생성됨
2. PR 본문에 `Closes #2` 포함
3. 머지 후 Issue #2가 자동 close
4. worktree 정리 완료

---

## 4) Round 2 재검토 제출용 증적 묶음

다음 증적을 동일 제출본에 포함한다.

1. Issue #2 URL + 메타데이터 스크린샷(제목/라벨/담당자)
2. `git remote -v`, `git ls-remote --heads origin main|develop` 결과
3. `main/develop` 보호 규칙 API 응답(JSON 요약)
4. 라벨 목록 출력(`gh label list`) 전문 또는 스크린샷
5. PR URL, merge 커밋 SHA, `Closes #2` 확인 캡처
6. worktree 정리 후 `git worktree list` 결과

---

## 5) 체크리스트 상태 템플릿 (제출 직전)

- [ ] GitHub 원격 저장소 연결 및 확인 완료
- [ ] main 브랜치 push 확인 완료
- [ ] develop 브랜치 생성/푸시 확인 완료
- [ ] main/develop 브랜치 보호 규칙 적용 완료
- [ ] 라벨 19종 등록 확인 완료
- [ ] feature → develop PR → merge 1회 검증 완료
- [ ] Issue #2 `Closes` 자동 처리 확인 완료

---

## 6) 범위 외이지만 즉시 확인 필요한 항목

원본 지시의 작업 6(.github 템플릿) 관련 파일은 현재 원격 `develop`에 없다.  
별도 담당(Lily) 작업으로 재반영 여부를 Round 2 제출 전에 병행 점검해야 한다.

대상 파일:

1. `.github/ISSUE_TEMPLATE/feature.md`
2. `.github/ISSUE_TEMPLATE/bug_report.md`
3. `.github/PULL_REQUEST_TEMPLATE.md`
4. `scripts/setup-labels.sh`
