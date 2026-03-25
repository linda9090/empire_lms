# [데이터 명세] AuditLog 모델 마이그레이션

**문서 번호:** DAT-2026-0325-001
**관련 기획:** PLN-2026-0325-001
**작성일:** 2026-03-25
**작성자:** 기획팀 세이지

---

## 1. 개요

관리자 콘솔 P0 보완 사항 중 운영 리스크 해결을 위해 **AuditLog 모델**을 신규 추가한다. 이는 모든 파괴적 관리자 액션을 추적하기 위한 불변 기록이다.

---

## 2. Prisma Schema 추가

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
  targetType String     @map("target_type")
  targetId  String      @map("target_id")
  oldValues String?     @map("old_values")   // JSON string: {"role": "STUDENT"}
  newValues String?     @map("new_values")   // JSON string: {"role": "TEACHER"}
  reason    String?                        // 관리자 입력 사유 (필수 권장)
  ipAddress  String?     @map("ip_address")
  userAgent  String?     @map("user_agent")
  createdAt  DateTime    @default(now()) @map("created_at")

  // 관계 정의
  actor User @relation("AuditLogs", fields: [actorId], references: [id], onDelete: Restrict)

  // 인덱스 (검색 성능)
  @@index([actorId])
  @@index([action])
  @@index([createdAt])
  @@index([targetType, targetId])
  @@map("audit_logs")
}
```

### 2.1 User 모델 관계 추가

기존 `User` 모델에 다음 관계를 추가:

```prisma
model User {
  // ... 기존 필드 ...
  auditLogs  AuditLog[]  @relation("AuditLogs")

  // ... 기존 관계 ...
}
```

---

## 3. 마이그레이션 스크립트

### 3.1 Migration 파일 생성 명령

```bash
npx prisma migrate dev --name add_audit_log_model
```

### 3.2 예상 생성되는 SQL

```sql
-- Create Enum
CREATE TYPE "AuditAction" AS ENUM (
  'USER_ROLE_CHANGED',
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'COURSE_PUBLISHED',
  'COURSE_UNPUBLISHED',
  'COURSE_DELETED',
  'PAYMENT_REFUNDED',
  'ADMIN_LOGIN'
);

-- Create Table
CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "old_values" TEXT,
  "new_values" TEXT,
  "reason" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Create Indexes
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- Foreign Key
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

---

## 4. 헬퍼 함수 사양

API 라우트에서 사용할 AuditLog 생성 헬퍼:

**위치:** `src/lib/audit.ts`

```typescript
import { db } from "@/lib/db";
import type { AuditAction, User } from "@prisma/client";

interface AuditLogParams {
  actor: User;
  action: AuditAction;
  targetType: string;
  targetId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(params: AuditLogParams) {
  return await db.auditLog.create({
    data: {
      actorId: params.actor.id,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
      newValues: params.newValues ? JSON.stringify(params.newValues) : null,
      reason: params.reason,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}
```

---

## 5. 사용 예시

### 5.1 사용자 역할 변경 시

```typescript
// PATCH /api/admin/users/[id]
const user = await db.user.findUnique({ where: { id: params.id } });
if (!user) return 404;

const oldRole = user.role;
const newRole = body.role;

await db.user.update({
  where: { id: params.id },
  data: { role: newRole }
});

await createAuditLog({
  actor: session.user,
  action: "USER_ROLE_CHANGED",
  targetType: "User",
  targetId: user.id,
  oldValues: { role: oldRole },
  newValues: { role: newRole },
  reason: body.reason,
  ipAddress: headers().get("x-forwarded-for") ?? undefined,
  userAgent: headers().get("user-agent") ?? undefined,
});
```

### 5.2 사용자 정지 시

```typescript
await createAuditLog({
  actor: session.user,
  action: "USER_SUSPENDED",
  targetType: "User",
  targetId: user.id,
  oldValues: { deletedAt: null },
  newValues: { deletedAt: new Date().toISOString() },
  reason: body.reason,  // 필수
});
```

---

## 6. 수용 기준

- [ ] `AuditAction` enum 정의 완료
- [ ] `AuditLog` 모델 정의 완료
- [ ] User 모델에 `auditLogs` 관계 추가
- [ ] 마이그레이션 실행 성공
- [ ] 외래 키 제약조건 `onDelete: Restrict` 적용 (관리자 삭제 불가)
- [ ] 인덱스 생성 확인
- [ ] `src/lib/audit.ts` 헬퍼 함수 구현

---

## 7. 주의사항

1. **onDelete: Restrict**: 감사 기록을 보존하기 위해 관리자 계정이 삭제되지 않도록 제약
2. **JSON 저장**: oldValues/newValues는 JSON 문자열로 저장하며, 필요 시 `JSON.parse()` 사용
3. **reason 필드**: 선택적이나 파괴적 액션 시 필수 권장 (UI에서 강제)
