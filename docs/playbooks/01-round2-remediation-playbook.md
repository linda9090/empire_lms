# Round 2 보완 실행 플레이북 (체크리스트 미완 4건)

작성일: 2026-03-23  
작성 브랜치: `climpire/e97237f3`  
목적: 라운드 1 미완 항목 4건을 라운드 2에서 한 번에 검증 가능하도록 실행/증빙 기준을 고정한다.

## 1) 미완 4건 확정 범위

1. `prisma migrate dev` 실행 성공 증빙 부족
2. `BETTER_AUTH_SECRET` 적용 후 TEACHER 로그인 성공 증빙 부족
3. 역할별 라우트 가드 동작(양/음성 경로) 증빙 부족
4. 라우팅/레이아웃 충돌 제거 후 재검증 증빙 부족  
   (중복 경로 충돌이 남아 있으면 2~3번 검증이 구조적으로 불가)

## 2) 우선순위 및 게이트

### Gate 0 (실행 환경 복구)
- 파이프라인/로컬 실행에서 `multi_agent` 미지원 플래그 제거
- 결과물: 실행 로그가 정상 시작되는 스크린샷 또는 콘솔 로그

### Gate 1 (검증 가능 상태 확보)
- 역할 라우트의 public path 충돌 제거 (`/teacher/*`, `/student/*`, `/guardian/*`, `/admin/*` 형태 권장)
- `npm run build` 성공
- 결과물: 빌드 성공 로그

### Gate 2 (체크리스트 4건 일괄 증빙)
- 아래 3~5절 명령을 순서대로 실행하고 로그를 PR에 첨부

## 3) DB 마이그레이션 증빙 규격

### 실행
```bash
mkdir -p artifacts/round2
npx prisma migrate dev --name init 2>&1 | tee artifacts/round2/01-prisma-migrate.log
npx prisma migrate status 2>&1 | tee artifacts/round2/02-prisma-status.log
```

### 합격 기준
- `migrate dev` exit code `0`
- `Database schema is up to date` 또는 동등한 성공 메시지 확인
- 스키마 테이블 생성 확인 로그 포함

## 4) TEACHER 로그인 증빙 규격

### 사전 조건
- `.env`에 `BETTER_AUTH_SECRET` 실값 설정
- 앱 서버 기동 상태

### 실행 (예시)
```bash
curl -i -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"name":"teacher1","email":"teacher1@example.com","password":"Passw0rd!","role":"TEACHER"}' \
  2>&1 | tee artifacts/round2/03-teacher-signup.log

curl -i -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher1@example.com","password":"Passw0rd!"}' \
  2>&1 | tee artifacts/round2/04-teacher-signin.log
```

### 합격 기준
- 로그인 응답이 성공 코드(200 계열 또는 구현 정책상 정상 redirect)
- 세션/쿠키 발급 확인

## 5) 역할별 라우트 가드 증빙 규격

### 검증 매트릭스
1. 비로그인 사용자가 역할 페이지 접근 시 로그인 경로로 차단(redirect 또는 401/403)
2. TEACHER 세션으로 `/teacher/*` 접근 성공
3. TEACHER 세션으로 `/student/*`, `/guardian/*`, `/admin/*` 접근 차단
4. STUDENT/GUARDIAN/ADMIN도 동일한 방식으로 상호 배타 접근 검증

### 실행
```bash
./scripts/devsecops/verify-route-guards.sh http://localhost:3000 \
  2>&1 | tee artifacts/round2/05-route-guard.log
```

### 합격 기준
- 허용 라우트는 성공, 비허용 라우트는 차단으로 일관
- 예외 케이스(200으로 잘못 통과) 0건

## 6) PR 첨부 필수 산출물

1. `artifacts/round2/01-prisma-migrate.log`
2. `artifacts/round2/02-prisma-status.log`
3. `artifacts/round2/03-teacher-signup.log`
4. `artifacts/round2/04-teacher-signin.log`
5. `artifacts/round2/05-route-guard.log`
6. `npm run build` 성공 로그
7. `npx tsc --noEmit` 성공 로그

## 7) 리뷰 판정 규칙 (MVP 정책 반영)

- CRITICAL/HIGH: 즉시 수정 후 재증빙 (미해결 시 반려)
- MEDIUM/LOW: 경고로 기록, 후속 이슈 분리 가능

최종 승인 조건: 위 필수 산출물이 모두 첨부되고, 체크리스트 미완 4건이 전부 PASS로 전환될 것.
