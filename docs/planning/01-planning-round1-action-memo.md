# 기획팀 Round 1 보완 조치 메모

**일자:** 2026-03-24
**작성자:** 클리오 (기획팀)
**관련 이슈:** [feat] 강의 관리 CRUD 및 수강신청 구현 (#5)

---

## 1. 수행 내용

### 1.1 타 부서 산출물 수집 및 분석

| 부서 | 산출물 | 핵심 발견 |
|------|--------|----------|
| 개발팀 | `docs/reports/dev-test-results-issue-5.md` | 58개 테스트 전체 통과, 단 소유권 검증 누락 인지 |
| 인프라보안팀 | `docs/reports/issue-5-infrasec-review.md` | HIGH 2건 (소유권, organizationId), WARN 1건 |
| 기획팀 | `docs/planning/issue-5-verification-plan.md` | 검증 체크리스트 및 실행 계획 완료 |

### 1.2 통합 보완 계획 문서 작성

생성한 문서: `ROUND1_SUPPLEMENT_SUBMISSION.md`

**구조:**
1. FUNCTION: 강의 CRUD·수강신청 시나리오/권한/예외 (3건)
2. SECURITY·REGULATION: FERPA·GDPR·COPPA (4건)
3. OPERATIONS: 마이그레이션·모니터링·롤백 (4건)
4. QA: 통합테스트 (1건 BLOCKING)

---

## 2. 핵심 의사결정 포인트

### 2.1 소유권 검증 (F-1/HIGH)

**배경:** 현재 구현에서任何 TEACHER가任何 course를 수정/삭제 가능
**발견:** 코드에 명시된 주석 `"For MVP, we'll allow any TEACHER or ADMIN to update any course"`
**결정:** PRODUCTION 배포 전 필수 수정, MVP 단계에서도 보안 리스크太高

**해결 방안:**
```prisma
model Course {
  id          String   @id @default(cuid())
  title       String
  description String?
  creatorId   String   // 추가
  creator     User     @relation("CourseCreator", fields: [creatorId], references: [id])
  // ...
}
```

### 2.2 organizationId 일치성 (S-1/HIGH)

**배경:** Schema는 `NOT NULL` 요구하나 API는 `null` 허용
**위험:** 특정 사용자 조건에서 500 에러 발생 가능
**결정:** API 수정 또는 모든 사용자 organizationId 보장

### 2.3 QA Blocking 해소 (Q-1/BLOCKING)

**배경:** QA팀 독립 관점에서 통합테스트 결과 미제출
**결정:** 개발팀 HIGH/MEDIUM 수정 완료 후 QA팀 최종 검증

---

## 3. 타임라인 최적화

### 3.1 병렬 실행 가능 항목

| 시간대 | 개발팀 | 인프라보안팀 | 운영팀 |
|--------|--------|--------------|--------|
| 15:00-17:00 | F-1 Ownership 구현 (2h) | S-2 + S-3 (1.5h) | O-1 Migration (1h) |
| 17:00-18:00 | F-2 + F-3 (1.5h) | S-4 문서화 (30m) | O-2 E2E (2h, 개발협업) |
| 18:00-19:00 | - | - | O-3 + O-4 (2h) |
| 19:00-22:00 | QA 협업 | QA 협업 | QA 협업 |

### 3.2 병목 포인트

1. **F-1 완료 전**: O-2 Staging E2E 지연 (개발팀 협업 필요)
2. **F-1+S-1 완료 전**: Q-1 QA 통합테스트 시작 불가

---

## 4. CEO Office 제출 사항

### 4.1 요청 액션

CEO Office는 다음 중 하나를 선택:

1. **[승인]** 보완 계획 승인 및 각 팀에 할당
2. **[수정]** 우선순위/ETA/완료기준 조정
3. **[범위 조정]** LOW 항목 차기 이슈 이관
4. **[SKIP]** Round 2로 진행 (비추천)

### 4.2 추천: [승인]

**사유:**
- 모든 항목에 심각도, 담당자, 완료기준, ETA 명시
- 병렬 실행으로 총 6-7시간에 최적화
- BLOCKING 항목(Q-1)에 의존성 명확화

---

## 5. 기획팀 Follow-up

### 5.1 즉시 액션

- [x] 보완 계획 문서 작성
- [x] CEO Office 제출
- [ ] CEO Office 결정 대기
- [ ] 결정 후 각 팀에 작업 할당

### 5.2 Round 2 준비

- [ ] 보완 작업 완료 후 각 팀 결과물 수집
- [ ] 최종 통합 검증 보고서 작성
- [ ] CEO Office 최종 승인 요청

---

## 6. 참고: 기획팀 관점 핵심 인사이트

1. **개발팀은 이미 문제 인지**: 테스트 결과 보고서에 `"Add course creator tracking for ownership verification"` 권고 사항으로 명시
2. **인프라보안팀 검증 프로세스 견고**: 자동화 스크립트로 보안 취약점 체계적 발견
3. **품질관리팀 BLOCKING 정당**: 독립 관점 검증 없이 완료 승인은 품질 보장 불가

---

**작성자:** 클리오 (기획팀)
**승인자:** 세이지 (기획팀장)
