# Farm Return

A free, premium-quality Irish farm management and financial intelligence
platform. See `docs/product-requirements.md` for the full product spec and
`CLAUDE.md` for the build rules — start there before changing anything.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm run test          # Vitest unit tests
npm run screenshot -- <url> <outDir>   # Playwright mobile+desktop screenshots
npm run check-overflow -- <url>        # flags elements wider than the viewport
```

## Status

**Phase 1 — pixel-accurate UI prototype** (mock data, no real domain
engines yet). Dashboard is the first screen built; see `CLAUDE.md` § Screen
workflow for how each subsequent screen gets built and QA'd against
`design/reference/`.
