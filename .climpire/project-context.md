# Project: empire_lms

## Tech Stack
Node.js, React 19.2.4, Next.js 16.2.1, TypeScript, Tailwind CSS, Prisma

## File Structure
```
├── docs/
│   ├── devsecops/
│   │   └── round2-priority-checks.md
│   └── reports/
│       └── dev-test-results-issue-5.md
├── messages/
│   ├── en.json
│   ├── ja.json
│   ├── ko.json
│   └── zh.json
├── prisma/
│   ├── migrations/
│   │   ├── 20260323064715_init/
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── schema.prisma
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── scripts/
│   ├── devsecops/
│   │   ├── preflight-env.sh
│   │   ├── verify-round2.sh
│   │   └── verify-route-guards.sh
│   ├── factcheck/
│   │   └── verify-github-branch-strategy.sh
│   ├── setup-labels.sh
│   └── smoke-test.md
├── src/
│   ├── __tests__/
│   │   ├── api/
│   │   │   ├── courses.test.ts
│   │   │   └── enrollments.test.ts
│   │   ├── auth/
│   │   │   ├── login.test.ts
│   │   │   └── middleware.test.ts
│   │   └── vitest-setup.ts
│   ├── app/
│   │   ├── (admin)/
│   │   │   ├── admin/
│   │   │   │   ...
│   │   │   └── layout.tsx
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   ...
│   │   │   ├── register/
│   │   │   │   ...
│   │   │   └── layout.tsx
│   │   ├── (guardian)/
│   │   │   ├── guardian/
│   │   │   │   ...
│   │   │   └── layout.tsx
│   │   ├── (student)/
│   │   │   ├── student/
│   │   │   │   ...
│   │   │   └── layout.tsx
│   │   ├── (teacher)/
│   │   │   ├── teacher/
│   │   │   │   ...
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ...
│   │   │   ├── courses/
│   │   │   │   ...
│   │   │   └── enrollments/
│   │   │       ...
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── unauthorized/
│   │   │   └── page.tsx
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── shared/
│   │   │   └── ShellLayout.tsx
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       └── label.tsx
│   ├── i18n/
│   │   ├── locale.ts
│   │   └── request.ts
│   ├── lib/
│   │   ├── auth-client.ts
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   ├── get-session.ts
│   │   ├── payment.ts
│   │   └── utils.ts
│   ├── types/
│   │   └── index.ts
│   └── middleware.ts
├── .env.example
├── AGENTS.md
├── CLAUDE.md
├── components.json
├── docker-compose.dev.yml
├── eslint.config.mjs
├── FACTCHECK_ROUND1_REVIEW.md
├── FACTCHECK_ROUND2_GITHUB_BRANCH_STRATEGY_AUDIT.md
├── FACTCHECK_ROUND2_SIGNOFF_BRANCH_STRATEGY.md
├── GITHUB_BRANCH_STRATEGY_REMEDIATION_PLAYBOOK.md
├── INFRASEC_ROUND2_FINAL_SIGNOFF_BRANCH_STRATEGY.md
├── next.config.ts
├── OPS_ROUND2_FINAL_SIGNOFF_BRANCH_STRATEGY.md
├── package.json
├── PLANNING_ROUND1_ACTION_MEMO.md
├── postcss.config.mjs
├── prisma.config.ts
├── QA_REVIEW_FINAL_SIGNOFF.md
├── QA_REVIEW_ISSUE_3_ROUND1.md
├── README.md
├── ROUND1_SUPPLEMENT_SUBMISSION.md
├── ROUND2_AGGREGATED_BRANCH_STRATEGY_SIGNOFF.md
├── ROUND2_REMEDIATION_PLAYBOOK.md
├── ROUND2_REVIEW_SUBMISSION.md
├── ROUND2_SIGNOFF_DESIGN_TEAM.md
├── ROUND2_WORKFLOW_VERIFICATION_REPORT.md
├── ROUND3_SIGNOFF_INFRASEC.md
├── ROUND3_SIGNOFF_OPS_FACTCHECK.md
├── tsconfig.json
└── vitest.config.ts
```

## Key Files
- package.json (1413 bytes)
- tsconfig.json (670 bytes)
- next.config.ts (287 bytes)
- .env.example (279 bytes)
- src/ (44 files)

## README (first 20 lines)
# Empire LMS

Global Learning Management System built with Next.js 15, TypeScript, and Prisma.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript (strict)
- **Styling**: Tailwind CSS 4 + Shadcn/ui
- **ORM**: Prisma 7 + PostgreSQL
- **Auth**: better-auth (4 roles: TEACHER, STUDENT, GUARDIAN, ADMIN)
- **Realtime**: Socket.io (PDF annotation sync)
- **Payments**: PaymentProvider abstraction (mock/stripe/paypal)
- **File Upload**: UploadThing
- **i18n**: next-intl (en, ko, ja, zh)
- **Testing**: Vitest + Playwright

## Prerequisites

- Node.js >= 20
- PostgreSQL database
