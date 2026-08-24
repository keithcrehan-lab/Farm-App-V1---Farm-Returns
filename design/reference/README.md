# Visual reference pack

Source: `Farm_Return_Product_Build_Specification` (v1.0, 23 August 2026), section 17.
These are the **approved visual reference** — reproduce them closely. Do not redesign,
simplify, or substitute generic SaaS/shadcn defaults. Sample names, figures and prices
shown in every image are illustrative demo values only, never production numbers.

## Source-of-truth hierarchy (spec section 00)

1. `docs/product-requirements.md` and the other `/docs` files define behaviour, data
   flow, architecture and build order — they win on anything factual/behavioural.
2. The two master boards (`master/`) define the global visual language, navigation and
   responsive composition.
3. The individual detail screens (`mobile/`) define module-level content and layout —
   the most detailed approved screen wins for its module if it conflicts with a master
   board.

## Master boards

| File | Spec reference | Contents |
|---|---|---|
| `master/master-01-ecosystem-overview.png` | 04A / 17 "Master reference 1" | Full mobile + desktop composition: phones (Home, Field/Soil detail), desktop dashboard, plus a second row of 5 mobile screens (Dashboard, Fields Map, Soil Health, Livestock, Finance) and 3 desktop screens (Soil Map & Analysis, Feed Optimiser, Input Planner). |
| `master/master-02-responsive-system.png` | 04B / 17A "Master reference 2" | 6 mobile screens (Dashboard, Map, Livestock, Soil, Fertiliser Plan, Feed Optimiser) top row, full desktop web app (left rail + dashboard + Input Planner summary) bottom row. This is the primary reference for the desktop left-rail navigation order and the desktop dashboard grid. |

## Mobile detail screens

| File | Spec caption |
|---|---|
| `mobile/mobile-dashboard-home.png` | "Detailed mobile dashboard reference — spreading opportunity, map hero and farm-level KPI cards." |
| `mobile/mobile-soil-overview.png` | "Detailed mobile soil overview — mapped fields, assumptions, farmer-adjusted and verified states." |
| `mobile/mobile-nutrient-planner.png` | "Detailed mobile nutrient planner — field context, soil, editable fertility assumptions, slurry offsets, purchased fertiliser and field cost." |
| `mobile/mobile-housing-slurry.png` | "Housing & slurry screen — linked livestock groups, estimated storage, nutrient value and suggested field allocation." |
| `mobile/mobile-silage-planning.png` | "Silage planning — field plan, expected production, nutrient/cost link, feed value and whole-farm deficit warning." |
| `mobile/mobile-finance.png` | "Farm financial overview — margin, livestock value, feed costs, fertiliser/slurry, cashflow and actionable opportunities." |
| `mobile/mobile-livestock-economics.png` | "Livestock economics — current weight/value, feed cost, performance forecast, cost to finish and sell-now versus finish margin." |
| `mobile/mobile-feed-optimiser.png` | "Feed optimiser — lowest cost, balanced and faster-finish strategies with performance and cost comparisons." |
| `mobile/mobile-spreading.png` | "Spreading screen — farm score, multi-day outlook, field-level reasons, hard stop and planned applications." |

## Desktop detail screens

No dedicated full-page desktop crops were supplied beyond the master boards. The desktop
composition for Soil Map & Analysis, Feed Optimiser and Input Planner appears as panels
inside `master/master-01-ecosystem-overview.png` (bottom-right row); the desktop dashboard
and left rail appear in both master boards. Treat those panels as the desktop
source-of-truth for those modules until higher-resolution desktop screens are supplied —
flag this as an open item rather than inventing desktop layouts for modules with no
desktop reference (see `docs/product-requirements.md` § open questions).

## Source document

`source/Farm_Return_Product_Build_Specification.pdf` is the original specification
document (v1.0, 23 August 2026) this whole `/design` and `/docs` tree was written from,
kept in the repo per the spec's own instruction (§00 / Build objective).

## Provenance

The images above were extracted from the embedded images of the source `.docx` (images
1–11 in document order) and renamed to describe their content rather than their
insertion order.
