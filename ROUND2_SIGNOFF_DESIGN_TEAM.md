# Round 2 Final Sign-off & Residual Risk Notes

Date: 2026-03-23
Branch: `climpire/b4892ee7`
Author: Design Team (Luna)

---

## 1. Round 2 Consensus Summary

All 7 team leads who participated in Round 2 agreed on the following:

- **Merge-blocking issues**: None remaining.
- **Residual risks**: To be tracked as follow-up issues (not merge blockers).
- **Next step**: Proceed to Round 3 for final sign-off decision.

---

## 2. Residual Risks (Post-Merge Follow-up Issues)

The following 4 residual risks were identified and agreed upon by all team leads. These are NOT merge blockers but must be tracked as separate issues after merge.

### Risk 1: Stripe Integration Stub

- **Status**: Stub/mock only (`PAYMENT_MODE=mock`)
- **Impact**: Payment flow is non-functional beyond mock mode
- **Follow-up**: Full Stripe + PayPal integration requires API keys and webhook setup
- **Tracking**: Separate issue required before production deployment

### Risk 2: i18n Routing Stub

- **Status**: `next-intl` is installed but routing integration is stub-level
- **Impact**: Locale-based routing and content switching are not fully wired
- **Follow-up**: Complete locale routing setup with `[locale]` segment, middleware locale detection, and message bundle loading
- **Tracking**: Separate issue required; blocks multi-language launch

### Risk 3: Crawling Integration Schema Extension

- **Status**: Current Prisma schema does not include models for external data ingestion
- **Impact**: Future crawling/content-import features will need schema additions
- **Follow-up**: Design extension points in Prisma schema when crawling requirements are finalized
- **Tracking**: Low priority; no current feature depends on this

### Risk 4: Multi-language UI Layout (Design Team Specific)

- **Status**: No RTL layout support or multi-language typography handling implemented
- **Impact**: Languages with RTL scripts (Arabic, Hebrew) or CJK-specific typography needs are unsupported
- **Follow-up**: See Section 3 below for detailed design team requirements
- **Tracking**: Must be addressed before launching in RTL-language markets

---

## 3. Design Team Sign-off Notes

### 3.1 Current State Assessment

The design team confirms the following scaffolding elements are in place and compatible with future design system expansion:

| Component | Status | Notes |
|-----------|--------|-------|
| Tailwind CSS 4 | Configured | Base config present; ready for design token extension |
| Shadcn/ui | Initialized | `components.json` exists; component library ready for use |
| App Router layout structure | Present | Role-based route groups with layout files exist |
| Responsive meta viewport | Present | Standard Next.js default |

### 3.2 No Merge-blocking Issues

The design team finds no UI/UX issues that would block the current scaffolding merge. The codebase provides a valid foundation for subsequent design system work.

### 3.3 Post-merge Design Requirements (Follow-up Issues)

#### A. i18n UI Layout & RTL Support

- **Requirement**: Add `dir` attribute handling (`ltr`/`rtl`) on the root `<html>` element based on active locale
- **Requirement**: Implement CSS logical properties (`margin-inline-start`, `padding-inline-end`, etc.) instead of physical directional properties in shared component styles
- **Requirement**: Verify Shadcn/ui component behavior under RTL context (dialog positioning, drawer slide direction, dropdown alignment)
- **Priority**: HIGH for markets requiring Arabic, Hebrew, or Persian language support
- **Suggested implementation**: Tailwind CSS `rtl:` variant + `next-intl` locale detection in root layout

#### B. Responsive Breakpoint Guidelines

- **Requirement**: Establish project-standard breakpoints aligned with Tailwind defaults (`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`)
- **Requirement**: Define minimum supported viewport width (recommended: 320px for mobile, 1024px for teacher/admin dashboards)
- **Requirement**: Create responsive layout patterns for role-specific dashboards (teacher dashboard may need wider minimum than student view)
- **Priority**: MEDIUM; current scaffolding uses Tailwind defaults which are acceptable as starting point

#### C. Design Token Foundation

- **Requirement**: Extend `tailwind.config.ts` with project-specific design tokens (color palette, spacing scale, typography scale)
- **Requirement**: Ensure Shadcn/ui CSS variables in `globals.css` are organized for theme-ability (dark mode readiness)
- **Priority**: MEDIUM; needed before first UI feature sprint

#### D. Accessibility Baseline

- **Requirement**: Ensure all role-based layouts include proper landmark regions (`<main>`, `<nav>`, `<aside>`)
- **Requirement**: Verify color contrast ratios meet WCAG 2.1 AA when design tokens are established
- **Priority**: MEDIUM; Shadcn/ui provides good defaults but project-specific theming needs verification

---

## 4. Pre-deployment QA Gate (Reaffirmed)

Per consensus from all team leads, the following CI/CD gates must remain mandatory before any deployment:

1. `npx prisma migrate dev` success (all tables created)
2. TEACHER account login success
3. Role-based route access control verification (positive and negative paths)
4. `npx tsc --noEmit` with 0 errors
5. Secret management and least-privilege checks
6. `npm run build` clean success

---

## 5. Decision

**Design Team verdict: APPROVE for merge to proceed to Round 3 final sign-off.**

No merge-blocking issues exist. All residual risks are documented above and will be tracked as follow-up issues post-merge.
