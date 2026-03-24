# Fact Check Review Round 1 (2026-03-23)

## Scope
- Validation target: `climpire/dcf20ec5-1` (`7de833c`)
- Reviewer branch: `climpire/f6addee3`
- Focus: unresolved checklist items from Round 1

## Evidence Summary
1. `npx prisma migrate dev --name init`
   - Result: success (`Already in sync, no schema change or pending migration was found.`)
2. `npx prisma migrate status`
   - Result: success (`Database schema is up to date!`)
3. DB table existence check (`pg_tables` via `pg` client)
   - Result: 15 tables confirmed (`organization`, `user`, `course`, `enrollment`, `activity`, `activity_session`, `annotation`, `learning_event`, `payment_transaction`, `lti_tool`, `consent`, plus better-auth tables).
4. `npx tsc --noEmit`
   - Result: success (0 errors)
5. `npm run build`
   - Result: failed (duplicate route resolution errors, 5 cases)
6. `npm run dev -- --port 3010` + `POST /api/auth/sign-up/email`
   - Result: request failed with `500` due to same route-collision compile errors

## Findings

### CRITICAL
1. Route collision blocks build/runtime.
   - Repro: `npm run build`
   - Build error points to duplicate paths resolved by route groups:
     - `src/app/(admin)/dashboard/page.tsx`
     - `src/app/(guardian)/dashboard/page.tsx`
     - `src/app/(student)/dashboard/page.tsx`
     - `src/app/(teacher)/dashboard/page.tsx`
     - `src/app/(student)/courses/page.tsx`
     - `src/app/(teacher)/courses/page.tsx`
     - `src/app/dashboard/page.tsx`
   - Impact: app cannot build; auth API and role-route verification are blocked at runtime.

### HIGH
1. Framework version mismatch against requirement.
   - Requirement: Next.js 15
   - Actual: `next@16.2.1` in `package.json` line 22, `eslint-config-next@16.2.1` line 45.
2. Required test stack not present.
   - Requirement: Vitest + Playwright
   - Actual: no `vitest` / `playwright` dependencies and no related scripts in `package.json` lines 5-10, 11-48.

## Checklist Status (Fact Check)
- [x] `npx prisma migrate dev` success
- [ ] TEACHER login success confirmed (blocked by CRITICAL route collision)
- [ ] Role-based route guard behavior confirmed (blocked by CRITICAL route collision)
- [x] TypeScript build check (`tsc --noEmit`) success
- [x] README exists with local run guide (consistency issue remains with Next.js version statement)

## Priority Verification Tasks (Round 2)
1. Resolve route topology so role pages do not resolve to identical public paths.
2. Re-run `npm run build` until clean.
3. Re-test auth flow: register/login TEACHER and verify session creation.
4. Re-test role guard matrix (TEACHER/STUDENT/GUARDIAN/ADMIN across role-only routes).
5. Align framework and testing stack with issue requirements (Next.js 15, Vitest, Playwright), then re-verify.
