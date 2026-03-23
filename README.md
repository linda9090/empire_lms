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
- npm

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/linda9090/empire_lms.git
cd empire_lms
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL` and `BETTER_AUTH_SECRET` (min 32 chars).

### 4. Set up the database

```bash
npx prisma migrate dev --name init
```

### 5. Generate Prisma client

```bash
npx prisma generate
```

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
  app/
    (auth)/         Login & Registration
    (teacher)/      Teacher-only routes
    (student)/      Student-only routes
    (guardian)/      Guardian-only routes
    (admin)/        Admin-only routes
    api/            REST API routes
    dashboard/      Role-based redirect
  components/
    ui/             Shadcn/ui components
    shared/         Shared components
  lib/
    auth.ts         better-auth server config
    auth-client.ts  better-auth client
    db.ts           Prisma client singleton
    payment.ts      PaymentProvider abstraction
    get-session.ts  Server-side session helper
  hooks/            Custom React hooks
  types/            TypeScript type definitions
  i18n/             Internationalization config
prisma/
  schema.prisma     Database schema
  prisma.config.ts  Prisma 7 config
messages/
  en.json           English translations
  ko.json           Korean translations
  ja.json           Japanese translations
  zh.json           Chinese translations
```

## User Roles

| Role     | Description                        |
| -------- | ---------------------------------- |
| TEACHER  | Creates and manages courses        |
| STUDENT  | Enrolls in and takes courses       |
| GUARDIAN | Monitors student progress          |
| ADMIN    | Full system administration access  |

## Environment Variables

| Variable                  | Description                          | Required |
| ------------------------- | ------------------------------------ | -------- |
| `DATABASE_URL`            | PostgreSQL connection string         | Yes      |
| `BETTER_AUTH_SECRET`      | Auth encryption secret (32+ chars)   | Yes      |
| `NEXT_PUBLIC_APP_URL`     | Application URL                      | Yes      |
| `PAYMENT_MODE`            | Payment mode: mock/stripe/paypal     | Yes      |
| `STRIPE_SECRET_KEY`       | Stripe API key                       | No       |
| `STRIPE_WEBHOOK_SECRET`   | Stripe webhook secret                | No       |
| `PAYPAL_CLIENT_ID`        | PayPal client ID                     | No       |
| `PAYPAL_CLIENT_SECRET`    | PayPal client secret                 | No       |
| `UPLOADTHING_SECRET`      | UploadThing secret                   | No       |
| `NEXT_PUBLIC_SOCKET_URL`  | Socket.io server URL                 | No       |

## Branch Strategy

- `main` - Production deployments only
- `develop` - Integration branch for all features
- `feature/#{issue}-{desc}` - Feature branches from develop
- `fix/#{issue}-{desc}` - Bug fix branches
- `hotfix/{desc}` - Hotfixes from main

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
```
