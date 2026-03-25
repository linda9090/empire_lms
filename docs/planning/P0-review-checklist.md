# [리뷰 라운드 2] P0 보완 사항 수용 기준 체크리스트

**문서 번호:** REV-2026-0325-002
**관련 기획:** PLN-2026-0325-001
**작성일:** 2026-03-25
**작성자:** 기획팀 세이지

---

## 개요

라운드 1 리뷰에서 식별된 P0 차단 사항에 대한 보완 완료 여부를 확인하는 체크리스트입니다. **모든 항목이 완료되어야 최종 승인으로 전환됩니다.**

---

## 1. API (Alex 담당)

### 1.1 라우트별 권한 직접 검증

| 항목 | 파일 | 확인 사항 | 완료 |
|------|------|-----------|------|
| GET /api/admin/users | `src/app/api/admin/users/route.ts` | `if (session?.user?.role !== "ADMIN") return 403` | ⬜ |
| PATCH /api/admin/users/[id] | `src/app/api/admin/users/[id]/route.ts` | 라우트 내 직접 검증 | ⬜ |
| GET /api/admin/courses | `src/app/api/admin/courses/route.ts` | 라우트 내 직접 검증 | ⬜ |
| PATCH /api/admin/courses/[id] | `src/app/api/admin/courses/[id]/route.ts` | 라우트 내 직접 검증 | ⬜ |
| GET /api/admin/stats | `src/app/api/admin/stats/route.ts` | 라우트 내 직접 검증 | ⬜ |

### 1.2 페이지네이션

| 항목 | 확인 사항 | 완료 |
|------|-----------|------|
| GET /api/admin/users | `page`, `pageSize` 파라미터 지원 | ⬜ |
| GET /api/admin/users | Response에 `pagination` 객체 포함 | ⬜ |
| GET /api/admin/users | `pageSize` 최대값 제한 (max: 100) | ⬜ |
| GET /api/admin/courses | `page`, `pageSize` 파라미터 지원 | ⬜ |
| GET /api/admin/courses | Response에 `pagination` 객체 포함 | ⬜ |

### 1.3 에러 코드 명확성 (400/403/404)

| 상황 | API | 예상 코드 | 확인 |
|------|-----|----------|------|
| 대상 사용자 없음 | PATCH /api/admin/users/[id] | 404 | ⬜ |
| 유효하지 않은 role | PATCH /api/admin/users/[id] | 400 | ⬜ |
| 자기 자신 변경 | PATCH /api/admin/users/[id] | 400 | ⬜ |
| 마지막 ADMIN 변경 | PATCH /api/admin/users/[id] | 400 | ⬜ |
| 비ADMIN 접근 | 전체 API | 403 | ⬜ |
| 대상 강의 없음 | PATCH /api/admin/courses/[id] | 404 | ⬜ |
| startDate > endDate | GET /api/admin/stats | 400 | ⬜ |
| 날짜 범위 > 365일 | GET /api/admin/stats | 400 | ⬜ |

### 1.4 감사 로그 (AuditLog)

| 항목 | 확인 사항 | 완료 |
|------|-----------|------|
| Prisma Schema | `AuditLog` 모델 정의 | ⬜ |
| Prisma Schema | `AuditAction` enum 정의 | ⬜ |
| Prisma Schema | User에 `auditLogs` 관계 추가 | ⬜ |
| Migration | 마이그레이션 실행 완료 | ⬜ |
| 헬퍼 함수 | `src/lib/audit.ts` 구현 | ⬜ |
| 사용자 역할 변경 | `USER_ROLE_CHANGED` 로그 기록 | ⬜ |
| 사용자 정지 | `USER_SUSPENDED` 로그 기록 | ⬜ |
| 사용자 재개 | `USER_REACTIVATED` 로그 기록 | ⬜ |
| 강의 비공개 | `COURSE_UNPUBLISHED` 로그 기록 | ⬜ |
| 강의 삭제 | `COURSE_DELETED` 로그 기록 | ⬜ |

---

## 2. UI (Mia 담당)

### 2.1 로딩 상태 (Skeleton UI)

| 페이지 | 확인 사항 | 완료 |
|--------|-----------|------|
| stats/page.tsx | 데이터 조회 중 Skeleton UI 표시 | ⬜ |
| stats/page.tsx | 통계 카드 Skeleton (4개) | ⬜ |
| stats/page.tsx | 차트 영역 Skeleton | ⬜ |

### 2.2 빈 데이터 상태 (Empty State)

| 페이지 | 확인 사항 | 완료 |
|--------|-----------|------|
| stats/page.tsx | 데이터 없음 시 아이콘 + 메시지 | ⬜ |
| users/page.tsx | 사용자 없음 시 Empty State | ⬜ |
| courses/page.tsx | 강의 없음 시 Empty State | ⬜ |

### 2.3 파괴적 액션 확인 모달

| 페이지 | 액션 | 확인 사항 | 완료 |
|--------|------|-----------|------|
| users/page.tsx | 계정 정지 | 확인 모달 표시 | ⬜ |
| users/page.tsx | 계정 정지 | 사유 입력 필수 (validation) | ⬜ |
| users/page.tsx | 계정 정지 | danger 스타일 (빨간색) | ⬜ |
| users/page.tsx | 계정 정지 | 취소 시 동작 없음 | ⬜ |
| courses/page.tsx | 강의 삭제 | 확인 모달 표시 | ⬜ |
| courses/page.tsx | 강의 삭제 | 사유 입력 필수 | ⬜ |
| courses/page.tsx | 강의 삭제 | danger 스타일 | ⬜ |

---

## 3. QA (Hawk 담당)

### 3.1 권한 우회 방지 테스트

| # | 테스트 케이스 | 예상 결과 | 완료 |
|---|--------------|----------|------|
| 1 | TEACHER 역할로 `/api/admin/users` 요청 | 403 Forbidden | ⬜ |
| 2 | STUDENT 역할로 `/api/admin/courses` 요청 | 403 Forbidden | ⬜ |
| 3 | 미인증 상태로 관리자 페이지 접근 | 로그인 리다이렉트 | ⬜ |
| 4 | 세션 조작(role=ADMIN 변조) | 403 Forbidden | ⬜ |

### 3.2 파라미터 무결성 테스트

| # | 테스트 케이스 | 예상 결과 | 완료 |
|---|--------------|----------|------|
| 1 | startDate > endDate | 400 INVALID_DATE_RANGE | ⬜ |
| 2 | 날짜 범위 > 365일 | 400 DATE_RANGE_TOO_LARGE | ⬜ |
| 3 | page = -1 | 400 INVALID_PAGE | ⬜ |
| 4 | pageSize = 1000 | 400 PAGE_SIZE_EXCEEDS_LIMIT | ⬜ |
| 5 | role = "INVALID_ROLE" | 400 INVALID_ROLE | ⬜ |

### 3.3 감사 로그 검증

| # | 테스트 케이스 | 검증 항목 | 완료 |
|---|--------------|----------|------|
| 1 | 사용자 역할 변경 | action=USER_ROLE_CHANGED, oldValues, newValues | ⬜ |
| 2 | 사용자 정지 | action=USER_SUSPENDED, reason 기록 | ⬜ |
| 3 | 강의 삭제 | action=COURSE_DELETED, courseId, reason | ⬜ |

### 3.4 테스트 파일

| 항목 | 확인 사항 | 완료 |
|------|-----------|------|
| 테스트 파일 | `src/__tests__/api/admin.test.ts` 존재 | ⬜ |
| 테스트 커버리지 | P0 테스트 케이스 전체 포함 | ⬜ |
| 테스트 결과 | `npm test` 전체 통과 | ⬜ |

---

## 4. 빌드 확인

| 항목 | 확인 사항 | 완료 |
|------|-----------|------|
| TypeScript | `npm run build` 에러 0건 | ⬜ |
| Lint | `npm run lint` 에러 0건 | ⬜ |
| Type Check | `tsc --noEmit` 에러 0건 | ⬜ |

---

## 5. 제출물

| 항목 | 파일/위치 | 완료 |
|------|-----------|------|
| 기획 명세서 | `docs/planning/P0-admin-console-spec.md` | ✅ |
| DB 마이그레이션 명세 | `docs/planning/P0-auditlog-migration-spec.md` | ✅ |
| API 구현 | `src/app/api/admin/**/*.ts` | ⬜ |
| UI 구현 | `src/app/(admin)/admin/**/page.tsx` | ⬜ |
| QA 테스트 | `src/__tests__/api/admin.test.ts` | ⬜ |

---

## 승인 조건

- [ ] API: 모든 P0 항목 완료 (권한 검증, 페이지네이션, 에러 코드, 감사 로그)
- [ ] UI: 모든 P0 항목 완료 (로딩/빈 상태, 확인 모달)
- [ ] QA: 모든 P0 테스트 케이스 통과
- [ ] 빌드: TypeScript 에러 0건

**위 모든 조건이 충족될 경우 즉시 최종 승인으로 전환합니다.**

---

*본 체크리스트는 기획팀 세이지가 작성했으며, 라운드 2 리뷰에서 사용됩니다.*
