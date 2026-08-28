# Real Farm V1 — build log

Sequential build session per the Real Farm V1 brief's "DEVELOPMENT METHOD."
Branched `claude/real-farm-v1` from `main` at `2170cfc`. Each entry below
records one phase: scope, what was built, tests/build result, commit.

---

## Phase 0 — baseline verification

Confirmed before branching:

```
git checkout main && git pull --ff-only origin main   # already up to date
npm test    # 58/58 test files, 881/881 tests passing
npm run build   # Next.js 16.3.2 (Turbopack) production build clean, 25 routes
```

`git checkout -b claude/real-farm-v1`.

Status: **complete.**

---

## Phase 1 — whole-application audit

Read every route (`src/app/**`), the store (`src/store/farm-store.tsx`),
the domain layer (`src/domain/*.ts`, ~50 modules), mock data
(`src/data/mock-farm.ts`), the three `localStorage` silos, `README.md`,
`OVERNIGHT_LOG.md`, and the `docs/scientific-engine/v3/` audit trail, plus
`git log` for work not yet reflected in `README.md` (the scientific-engine
v3 closure passes).

**Headline finding**: no auth, no database, one global unscoped
`localStorage` farm shared by every visitor. Domain calculation engines,
provenance system, weather integration, and CSO market data are genuinely
real and must be preserved untouched — this build is persistence/account
plumbing on top of them, not a rewrite.

Full findings: `docs/real-farm-v1/IMPLEMENTATION_AUDIT.md`.

Status: **complete.**

---
