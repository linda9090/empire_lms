# [기획 명세] 관리자 콘솔 P0 보완 사항

**문서 번호:** PLN-2026-0325-001
**작성일:** 2026-03-25
**작성자:** 기획팀 세이지
**우선순위:** P0 (차단 - 승인 전 필수)

---

## 1. 개요

### 1.1 배경
라운드 1 리뷰에서 식별된 P0 차단 사항을 즉시 보완하기 위한 기획 명세서. 본 명세서의 모든 항목은 최종 승인 전 필수 구현 항목이다.

### 1.2 범위
- API: 라우트별 ADMIN 권한 검증, 페이지네이션, 에러 경계 명합, 감사 로그
- UI: 로딩/빈 상태, 파괴적 액션 확인 모달
- QA: 권한 우회 테스트, 파라미터 무결성 검증

---

## 2. 데이터베이스 스키마 변경

### 2.1 AuditLog 모델 추가 (운영팀 P0)

**위치:** `prisma/schema.prisma`

```prisma
enum AuditAction {
  USER_ROLE_CHANGED
  USER_SUSPENDED
  USER_REACTIVATED
  COURSE_PUBLISHED
  COURSE_UNPUBLISHED
  COURSE_DELETED
  PAYMENT_REFUNDED
  ADMIN_LOGIN
}

model AuditLog {
  id        String      @id @default(cuid())
  actorId   String      @map("actor_id")
  action    AuditAction
  targetType String     @map("target_type")  // "User", "Course", "Payment" etc.
  targetId  String      @map("target_id")
  oldValues String?     @map("old_values")   // JSON string
  newValues String?     @map("new_values")   // JSON string
  reason    String?                        // 관리자 입력 사유
  ipAddress  String?     @map("ip_address")
  userAgent  String?     @map("user_agent")
  createdAt  DateTime    @default(now()) @map("created_at")

  actor User @relation(fields: [actorId], references: [id])

  @@index([actorId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
```

**Migration 우선순위:** P0 - 첫 번째로 실행 필요

---

## 3. API 사양 (Alex 담당)

### 3.1 공통 설계 원칙

| 항목 | 사양 |
|------|------|
| 권한 검증 | 각 라우트 내에서 직접 `session.user.role === "ADMIN"` 확인 (미들웨어만 의존 금지) |
| 페이지네이션 | 모든 목록 조회는 `page`, `pageSize` 파라미터 필수 (기본값: page=1, pageSize=20) |
| 에러 코드 | 400: Bad Request, 403: Forbidden, 404: Not Found 명확 구분 |

### 3.2 GET /api/admin/users

**목적:** 전체 사용자 목록 조회 (페이지네이션 필수)

**Request Query Parameters:**
```
page: number = 1
pageSize: number = 20 (max: 100)
role?: UserRole
search?: string (이름 또는 이메일)
sortBy?: "createdAt" | "name" | "email"
sortOrder?: "asc" | "desc"
```

**Response 200:**
```typescript
{
  users: Array<{
    id: string
    name: string
    email: string
    role: UserRole
    organizationId?: string
    createdAt: string
    deletedAt?: string
  }>,
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}
```

**Response 403 (비ADMIN):**
```json
{
  "error": "FORBIDDEN",
  "message": "Admin access required"
}
```

### 3.3 PATCH /api/admin/users/[id]

**목적:** 사용자 역할 변경 또는 계정 정지/재개

**Request Body:**
```typescript
{
  role?: UserRole
  deletedAt?: string | null  // null이면 재개, ISO date이면 정지
  reason?: string            // 감사 로그용 사유 (필수 권장)
}
```

**Error Response 분기:**

| 상황 | HTTP Code | Response |
|------|-----------|----------|
| 대상 사용자 없음 | 404 | `{ error: "NOT_FOUND", message: "User not found" }` |
| role이 유효하지 않음 | 400 | `{ error: "INVALID_ROLE", message: "Invalid role specified" }` |
| 자기 자신의 역할 변경 | 400 | `{ error: "CANNOT_MODIFY_SELF", message: "Cannot modify your own role" }` |
| ADMIN 역할 마지막 1명 | 400 | `{ error: "LAST_ADMIN", message: "Cannot modify the last admin" }` |
| 비ADMIN 접근 | 403 | `{ error: "FORBIDDEN", message: "Admin access required" }` |

**AuditLog 기록:**
- `USER_ROLE_CHANGED`: oldValues={oldRole}, newValues={newRole}
- `USER_SUSPENDED`: reason 포함
- `USER_REACTIVATED`: reason 포함

### 3.4 GET /api/admin/courses

**Request Query Parameters:**
```
page: number = 1
pageSize: number = 20 (max: 100)
isPublished?: boolean
search?: string (제목)
sortBy?: "createdAt" | "title" | "enrollmentCount"
sortOrder?: "asc" | "desc"
```

**Response 200:**
```typescript
{
  courses: Array<{
    id: string
    title: string
    description?: string
    isPublished: boolean
    teacherId?: string
    teacherName?: string
    enrollmentCount: number
    createdAt: string
    deletedAt?: string
  }>,
  pagination: { ... }
}
```

### 3.5 PATCH /api/admin/courses/[id]

**Request Body:**
```typescript
{
  isPublished?: boolean
  deletedAt?: string | null  // Soft delete
  reason?: string
}
```

**Error Response 분리:**

| 상황 | HTTP Code | Response |
|------|-----------|----------|
| 대상 강의 없음 | 404 | `{ error: "NOT_FOUND", message: "Course not found" }` |
| 이미 삭제된 강의 | 400 | `{ error: "ALREADY_DELETED", message: "Course already deleted" }` |
| 비ADMIN 접근 | 403 | `{ error: "FORBIDDEN", message: "Admin access required" }` |

**AuditLog 기록:**
- `COURSE_PUBLISHED`: courseId, teacherId
- `COURSE_UNPUBLISHED`: courseId, teacherId
- `COURSE_DELETED`: courseId, teacherId, reason

### 3.6 GET /api/admin/stats

**Request Query Parameters:**
```
startDate?: string (ISO date, 기본: 30일 전)
endDate?: string (ISO date, 기본: 오늘)
```

**Parameter 무결성 검증 (QA P0):**
```typescript
if (startDate > endDate) return 400 {
  error: "INVALID_DATE_RANGE",
  message: "startDate must be before or equal to endDate"
}

if (daysBetween(startDate, endDate) > 365) return 400 {
  error: "DATE_RANGE_TOO_LARGE",
  message: "Date range cannot exceed 365 days"
}
```

**Response 200:**
```typescript
{
  period: { startDate: string, endDate: string },
  summary: {
    newUsers: number
    newEnrollments: number
    totalRevenue: number
    completionRate: number
  },
  dailyStats: Array<{
    date: string
    newUsers: number
    newEnrollments: number
    revenue: number
  }>,
  courseStats: Array<{
    courseId: string
    title: string
    enrollmentCount: number
    completionRate: number
    revenue: number
  }>
}
```

---

## 4. UI 사양 (Mia 담당)

### 4.1 P0-1: 로딩 상태 (stats/page.tsx)

**요구사항:**
- 데이터 조회 중에 Skeleton UI 표시
- 차트 영역은 로딩 스피너 또는 Skeleton Bar

**Skeleton 구조:**
```tsx
<div className="space-y-4">
  {/* 통계 카드 Skeleton */}
  <div className="grid grid-cols-4 gap-4">
    {[1,2,3,4].map(i => (
      <div key={i} className="h-24 bg-gray-200 animate-pulse rounded" />
    ))}
  </div>
  {/* 차트 Skeleton */}
  <div className="h-64 bg-gray-200 animate-pulse rounded" />
</div>
```

### 4.2 P0-2: 빈 데이터 상태 (Empty State)

**요구사항:**
- 데이터가 없을 때 명확한 시각적 피드백
- 아이콘 + 메시지 + (선택적) 액션 버튼

**Empty State 컴포넌트:**
```tsx
<div className="flex flex-col items-center justify-center py-12">
  <Icon name="inbox" className="h-12 w-12 text-gray-400 mb-4" />
  <p className="text-gray-600">표시할 데이터가 없습니다</p>
  {hasCreatePermission && (
    <Button className="mt-4">첫 강의 만들기</Button>
  )}
</div>
```

### 4.3 P0-4: 파괴적 액션 확인 모달

**적용 대상:**
- 사용자 정지 (`users/page.tsx`)
- 강의 비공개/삭제 (`courses/page.tsx`)

**모달 명세:**
```tsx
<ConfirmationModal
  isOpen={showModal}
  title="계정 정지 확인"
  message={`정말로 ${user.name}(${user.email})의 계정을 정지하시겠습니까?`}
  details={[
    { label: "역할", value: user.role },
    { label: "가입일", value: formatDate(user.createdAt) },
    { label: "소속", value: user.organization?.name || "없음" }
  ]}
  requireReason={true}  // 사유 입력 필수
  reasonLabel="정지 사유"
  reasonPlaceholder="정지 사유를 입력하세요"
  confirmLabel="계정 정지"
  cancelLabel="취소"
  onConfirm={(reason) => handleSuspend(user.id, reason)}
  variant="danger"  // 빨간색 버튼
/>
```

**사유 입력 필수화:**
- 감사 로그에 `reason` 필드가 있어야 함
- 빈 값으로는 확인 버튼 비활성화

---

## 5. QA 테스트 케이스 (Hawk 담당)

### 5.1 권한 우회 방지 테스트 (P0)

| # | 시나리오 | 예상 결과 |
|---|----------|----------|
| 1 | TEACHER 역할로 `/api/admin/users` 요청 | 403 Forbidden |
| 2 | STUDENT 역할로 `/api/admin/courses` 요청 | 403 Forbidden |
| 3 | 미인증 상태로 관리자 페이지 접근 | 로그인 페이지로 리다이렉트 |
| 4 | 세션 조작(role=ADMIN 변조) | 403 Forbidden (서버에서 재검증) |

### 5.2 파라미터 무결성 테스트 (P0)

| # | 시나리오 | 예상 결과 |
|---|----------|----------|
| 1 | startDate > endDate | 400 INVALID_DATE_RANGE |
| 2 | 날짜 범위 > 365일 | 400 DATE_RANGE_TOO_LARGE |
| 3 | page = -1 | 400 INVALID_PAGE |
| 4 | pageSize = 1000 | 400 PAGE_SIZE_EXCEEDS_LIMIT |
| 5 | role = "INVALID_ROLE" | 400 INVALID_ROLE |

### 5.3 감사 로그 검증 (P0)

| # | 액션 | 검증 항목 |
|---|------|----------|
| 1 | 사용자 역할 변경 | action=USER_ROLE_CHANGED, oldValues, newValues 기록됨 |
| 2 | 사용자 정지 | action=USER_SUSPENDED, reason 기록됨 |
| 3 | 강의 삭제 | action=COURSE_DELETED, courseId, reason 기록됨 |

---

## 6. 수용 기준 체크리스트

### 6.1 API (Alex)

- [ ] `/api/admin/users` 페이지네이션 동작 (page, pageSize, total)
- [ ] `/api/admin/users/[id]` 400/403/404 정확한 에러 코드
- [ ] 각 라우트에 직접 `if (session.user.role !== "ADMIN")` 검증
- [ ] AuditLog 모델 추가 및 마이그레이션 완료
- [ ] 모든 파괴적 액션에 AuditLog 기록

### 6.2 UI (Mia)

- [ ] stats/page.tsx 로딩 Skeleton UI
- [ ] stats/page.tsx 빈 데이터 Empty State
- [ ] users/page.tsx 계정 정지 확인 모달 (사유 입력 필수)
- [ ] courses/page.tsx 강의 삭제 확인 모달

### 6.3 QA (Hawk)

- [ ] 권한 우회 테스트 케이스 전체 통과
- [ ] 파라미터 무결성 테스트 케이스 전체 통과
- [ ] 감사 로그 검증 테스트 전체 통과
- [ ] 테스트 코드: `src/__tests__/api/admin.test.ts`

---

## 7. 타임라인

| 작업 | 담당 | 예상 소요 | 선행 의존 |
|------|------|-----------|-----------|
| AuditLog 마이그레이션 | Alex | 20분 | 없음 |
| API 라우트 구현 | Alex | 2시간 | 마이그레이션 |
| UI 로딩/빈 상태 | Mia | 1시간 | API 완료 |
| UI 확인 모달 | Mia | 1.5시간 | 없음 |
| QA 테스트 작성 | Hawk | 1.5시간 | API/UI 완료 |
| **합계** | - | **6.5시간** | - |

---

## 8. 부록

### 8.1 참고 파일
- 기존 Dashboard: `src/app/(admin)/admin/dashboard/page.tsx`
- Prisma Schema: `prisma/schema.prisma`
- Auth 구현: `src/lib/auth.ts`

### 8.2 변경 이력
| 버전 | 일자 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 1.0 | 2026-03-25 | 초안 작성 | 세이지 |
