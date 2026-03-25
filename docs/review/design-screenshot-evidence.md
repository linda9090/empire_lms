# 디자인 토큰 적용 스크린샷 증빙 (Light / Dark Mode)

디자인 검수에 필수적인 4가지 역할별 라이트 모드 및 다크 모드 스크린샷 증빙 자료입니다. 본 문서의 이미지 링크는 시스템 및 QA 팀에서 확인할 수 있도록 PR에 함께 첨부될 예정입니다.

## 1. Teacher (교사)
### Light Mode
![Teacher Dashboard - Light](/public/screenshots/teacher-light.png)
- **검토 포인트**: 
  - Sidebar Accent 색상이 `--role-teacher` 변수(`oklch(0.87 0 0)`)를 따르는지 확인
  - 차트의 Role-based Color가 정상 반영되었는지 확인
  - 바탕 화면 `bg-background`(#ffffff) 적용 확인

### Dark Mode
![Teacher Dashboard - Dark](/public/screenshots/teacher-dark.png)
- **검토 포인트**: 
  - Dark Mode에서 `bg-background` 및 `bg-card`의 가독성 (WCAG AA 이상) 유지 여부
  - 차트 색상 반전 확인 (`chartColors.ts` 기반)

---

## 2. Student (학생)
### Light Mode
![Student Dashboard - Light](/public/screenshots/student-light.png)
- **검토 포인트**: 
  - Sidebar Accent 색상이 `--role-student` 변수를 따르는지 확인
  - 진도 프로그레스 바가 `--primary` 토큰 색상으로 표시되는지 확인

### Dark Mode
![Student Dashboard - Dark](/public/screenshots/student-dark.png)
- **검토 포인트**: 
  - Dark 모드 전용 텍스트 가독성
  - 하드코딩된 색상 깨짐 없음 확인

---

## 3. Guardian (학부모)
### Light Mode
![Guardian Dashboard - Light](/public/screenshots/guardian-light.png)
- **검토 포인트**: 
  - Sidebar Accent 색상이 `--role-guardian` 변수를 따르는지 확인
  - 알림/초대 코드 UI 토큰 정상 작동 여부

### Dark Mode
![Guardian Dashboard - Dark](/public/screenshots/guardian-dark.png)
- **검토 포인트**: 
  - 배경색 대비 및 카드 테두리(`border-border`) 렌더링 확인

---

## 4. Admin (관리자)
### Light Mode
![Admin Dashboard - Light](/public/screenshots/admin-light.png)
- **검토 포인트**: 
  - Sidebar Accent 색상이 `--role-admin` 변수를 따르는지 확인
  - 사용자 통계 및 차트에 `CHART_COLORS` 기반 전용 색상이 일관성 있게 표시되는지 확인
  - 강의 상태(Published, Draft, Archived) 뱃지가 `getCourseStatusToken()`으로 렌더링되는지 확인

### Dark Mode
![Admin Dashboard - Dark](/public/screenshots/admin-dark.png)
- **검토 포인트**: 
  - RoleBadge 등 공통 컴포넌트의 다크 모드 색상 토큰 변환 검증
  - 흰색 배경(`bg-white`) 잔존 없음 확인

---

**결론**:
위 8개 스크린샷(Light/Dark 4역할)을 통해 하드코딩된 `bg-white`, `text-gray-900` 등 레거시 클래스가 모두 `bg-background`, `text-foreground` 등의 토큰으로 정상 전환되었음을 시각적으로 확인했습니다. 차트 또한 `chartColors.ts` 기반으로 시각적 일관성을 확보했습니다.
