# [검토보완] 품질관리팀 라운드2 보완 완료 보고서 - Issue #10

작성일: 2026-03-25 (KST)
담당: 품질관리팀 호크(린트)
브랜치: `climpire/0863635c`
대상 업무: `[feat] 알림 시스템 인앱 + 이메일 (#10)`

## 1) 처리 대상 (미해결 체크리스트 1건)

Review 회의 보완 요청(품질관리팀 in-progress 항목):

1. 이메일 발송 실패 시나리오 테스트 보강
2. 알림 생성 경계값 테스트 보강(`recipient.userId=null`, `lessonId=null`)
3. 다중 사용자 환경에서 타인 알림 읽음 처리 403 검증(API 레이어 기준)

본 문서는 상기 1건을 순차 검증으로 처리한 QA 재검토 근거다.

## 2) 필수 참조 산출물 (Read-only)

다음 개발팀 산출물을 직접 열람/대조했다.

- `/work/empire_lms/.climpire-worktrees/16efe57f/src/__tests__/api/notifications.test.ts`
- `/work/empire_lms/.climpire-worktrees/16efe57f/src/app/api/notifications/route.ts`
- `/work/empire_lms/.climpire-worktrees/16efe57f/src/app/api/notifications/read/route.ts`
- `/work/empire_lms/.climpire-worktrees/16efe57f/src/lib/notification.ts`
- `/work/empire_lms/.climpire-worktrees/16efe57f/prisma/schema.prisma`

## 3) 재검증 결과

### 3-1. 이메일 실패 시나리오

- 테스트: `stores notification in DB even when email delivery fails`
- 검증 포인트:
  - 이메일 전송 실패 시에도 `db.notification.create`가 선행 호출되어 인앱 알림이 저장됨
  - 이후 `db.notification.update`로 `emailStatus=RETRY_PENDING`, `emailRetryCount=1`로 상태 전이됨
- 판정: **PASS**

### 3-2. 경계값(`userId`, `lessonId`) 시나리오

- 테스트: `rejects notification creation when recipient userId is null`
  - `recipient.userId=null` 입력에 대해 예외 발생 확인
- 테스트: `accepts lessonId null boundary and stores null safely`
  - `lessonId=null` 허용 및 DB 저장값 null 보존 확인
- 판정: **PASS**

### 3-3. 다중 사용자 403 시나리오(API 레이어)

- 테스트: `returns 403 when reading another user's notification`
- 검증 포인트:
  - 로그인 사용자(`student-1`)가 타 사용자 알림(`student-2`) 읽음 처리 시도 시 `403`
  - 금지 시 업데이트 쿼리(`updateMany`) 미실행
- 판정: **PASS**

## 4) 실행 증빙

### 4-1. 알림 보완 테스트 단독 실행

명령:
```bash
npm run test -- --run src/__tests__/api/notifications.test.ts
```

결과:
- Test Files: `1 passed`
- Tests: `6 passed (6)`

### 4-2. 전체 회귀 스위트 실행

명령:
```bash
npm run test
```

결과:
- Test Files: `10 passed`
- Tests: `116 passed, 2 skipped`

## 5) 결함/리스크 분류 (MVP 코드리뷰 정책)

### CRITICAL/HIGH

- 신규 CRITICAL/HIGH 결함 미발견.

### MEDIUM/LOW (경고 보고, 코드 수정 없음)

1. **LOW**: 다중 사용자 403 검증은 Route Handler 레이어를 직접 호출하는 방식이며, E2E HTTP/실DB 기반 시나리오는 별도 스테이징 스모크로 보완 권장.

## 6) 최종 판정

- 품질관리팀 미해결 체크리스트 1건을 순차 검증으로 처리 완료했다.
- Round 1 보완 요구 3항목(이메일 실패, 경계값, 타인 접근 403)은 테스트 증빙 기준 충족으로 판단한다.
- QA 관점에서 리뷰 라운드 2 최종 의사결정(머지 판단) 진입 가능 상태다.
