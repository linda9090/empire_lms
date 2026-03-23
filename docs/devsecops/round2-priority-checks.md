# DevSecOps Round 2 Priority Checks

## Scope

This checklist covers the unresolved Round 1 items that are in infrastructure and security scope:

1. Local PostgreSQL provisioning for `prisma migrate dev`
2. Environment secret hygiene (`BETTER_AUTH_SECRET`, payment keys)
3. Reproducible verification in CI
4. Route guard behavior check for role routes (unauthenticated access blocked)

## Local Verification Steps

1. Start local database:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

2. Prepare env file and set real secrets where required:

```bash
cp .env.example .env
```

3. Run full Round 2 infra verification:

```bash
./scripts/devsecops/verify-round2.sh
```

4. After starting the app (`npm run dev`), verify unauthenticated route guards:

```bash
./scripts/devsecops/verify-route-guards.sh http://localhost:3000
```

## Expected Evidence for PR

Attach command outputs for:

1. `npx prisma migrate dev` success log
2. `npx tsc --noEmit` success log
3. Route guard check output (`verify-route-guards.sh`)
4. CI workflow result (`devsecops-round2`)
