# [chore] 디자인 토큰 적용 현황 점검 및 일괄 적용

## 개요
Issue #4-D에서 정의한 디자인 토큰 적용 현황을 점검하고, 미적용 항목을 일괄 반영했습니다.

- RoleBadge 기반 역할 뱃지 통일
- 역할별 토큰(`getRoleToken`, `getCourseStatusToken`) 기반 스타일 적용
- 하드코딩 색상 제거 및 `bg-background`/`text-muted-foreground` 계열 토큰 치환
- 차트 색상 하드코딩 제거 및 `src/lib/chartColors.ts` 중앙화
- 라이트/다크 모드 4역할 대시보드 시각 증빙 생성

## 사전 확인
- `src/lib/tokens.ts` 존재: 확인됨
- `src/app/globals.css` CSS 변수 정의(`--role-teacher` 포함): 확인됨
- `src/app/globals.css` `.dark` 변수 정의: 확인됨
- `tailwind.config.ts` `colors.role` 설정: 확인됨
- `src/components/shared/RoleBadge.tsx` 존재: 확인됨

## 변경 파일
- `src/lib/tokens.ts` (신규)
- `src/lib/chartColors.ts` (신규)
- `src/components/shared/RoleBadge.tsx` (신규)
- `tailwind.config.ts` (신규)
- `src/app/globals.css`
- `src/components/shared/ShellLayout.tsx`
- `src/app/(admin)/layout.tsx`
- `src/app/(guardian)/layout.tsx`
- `src/app/(student)/layout.tsx`
- `src/app/(teacher)/layout.tsx`
- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/app/(guardian)/guardian/dashboard/page.tsx`
- `src/app/(student)/student/dashboard/page.tsx`
- `src/app/(teacher)/teacher/dashboard/page.tsx`
- `src/app/(teacher)/teacher/dashboard/completion-rate-chart.tsx`
- `src/app/(teacher)/teacher/courses/page.tsx`
- `src/app/(student)/student/courses/page.tsx`
- `scripts/capture-role-dashboards.mjs` (신규)
- `docs/screenshots/design-tokens/*.png` (신규 8장)

## 점검 대상 파일 예외
- `src/components/shared/SidebarNav.tsx`: 현재 브랜치에 파일 없음
- `src/components/shared/Header.tsx`: 현재 브랜치에 파일 없음

## 점검 결과 (grep)
- `grep -r "bg-role-" src/app/`: `0`
- `grep -r "text-role-" src/app/`: `0`
- `grep -r "getRoleToken" src/app/`: `0`
- `grep -r "badgeClass" src/app/`: `1`
- `grep -r "#" src/app/ --include="*.tsx"`: `0`
- `grep -r -E "#[0-9a-fA-F]{6}" src/app/ --include="*.tsx"`: `0`

참고: 역할 컬러 클래스 및 `getRoleToken` 사용은 공통 계층(`src/components/shared`, `src/lib`)으로 중앙화되어 있으며,
`src/app`에서는 `RoleBadge`/`getCourseStatusToken` 호출을 통해 적용됩니다.

## 다크모드 동작 확인 (Playwright 캡처)
### 라이트/다크 스크린샷 경로
- `docs/screenshots/design-tokens/teacher-dashboard-light.png`
- `docs/screenshots/design-tokens/teacher-dashboard-dark.png`
- `docs/screenshots/design-tokens/student-dashboard-light.png`
- `docs/screenshots/design-tokens/student-dashboard-dark.png`
- `docs/screenshots/design-tokens/guardian-dashboard-light.png`
- `docs/screenshots/design-tokens/guardian-dashboard-dark.png`
- `docs/screenshots/design-tokens/admin-dashboard-light.png`
- `docs/screenshots/design-tokens/admin-dashboard-dark.png`

### 확인 항목
- 역할별 뱃지 컬러 정상 표시
- 사이드바 역할별 accent 컬러 정상 반영
- 다크모드 전환 시 배경/텍스트 대비 유지
- 차트 영역 포함 하드코딩 색상 깨짐 없음

## 검증
- `npx prisma generate && npx tsc --noEmit`: 통과
- `npm run test`: 통과 (`10 files`, `131 passed`, `2 skipped`)
- `npm run lint`: 실패 (선행 브랜치 이슈)
  - 주요 원인: `src/__tests__/api/payments.test.ts`의 `@typescript-eslint/no-explicit-any` (32 errors 중 다수)
  - 전체 결과: `32 errors`, `20 warnings`
  - 본 작업 변경 파일 대상 개별 lint 실행 시 error 0건 (`globals.css`는 ESLint 구성상 검사 제외 경고 1건)

## 잔여 리스크 (문서화)
1. 차트 런타임 색상 바인딩
- 영향 범위: Recharts 렌더링 영역 (`completion-rate-chart.tsx`)
- 재현 조건: 일부 런타임/브라우저 조합에서 CSS 변수 해석 지연
- 완화 계획: `src/lib/chartColors.ts` 중앙화 유지, 차트 관련 회귀 시 해당 모듈 기준으로 일괄 점검

2. 일부 브라우저 명암비 저하
- 영향 범위: 다크모드 카드/텍스트 대비
- 재현 조건: 브라우저별 색역/감마 차이에 따른 미세한 명도 차이
- 완화 계획: 접근성 점검(대비 비율) 주기 검토 및 토큰 값 미세 조정

## PR 규칙 확인
- 제목: `[chore] 디자인 토큰 적용 현황 점검 및 일괄 적용`
- 대상 브랜치: `develop`
- 본문 내 `Closes` 문구 없음

작성일: 2026-03-25 (KST)
