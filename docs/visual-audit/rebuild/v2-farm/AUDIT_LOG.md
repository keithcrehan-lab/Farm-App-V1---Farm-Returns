# Phase V2 — Farm/Field exploration — Codex visual audit log

Reference: `docs/product/farm-return-next-v1.1/media/image3.png` (composition
only, re-themed light). Screenshot audited each round:
`v2-farm-mobile-after.png` (390×844, real/demo mode).

| Round | Commit | Fidelity | Verdict | Dashboard drift | Headline fix that round |
|---|---|---|---|---|---|
| 1 | d3aadd9 | 6.8/10 | PARTIAL | LOW | (bounded card FieldMap -> real full-bleed-in-card MapHero) |
| 2 | 357e4fd | 6.8/10 | PARTIAL | MEDIUM | Fixed a real bug (selected-field boundary paint frozen at first load), added camera fly-to-selection |

## Outcome: BLOCKED_HUMAN on full-bleed composition, same root cause as Today

Two rounds produced one genuine bug fix (the selected-field boundary
highlight was silently frozen on whichever field loaded first — `MapHero`
only updated its paint once, inside the map's one-time `load` handler) and
a real new capability (the camera now flies to a selected field's actual
bounds, matching real tap-to-select interaction). Both rounds scored the
map surface itself as a genuine improvement ("real satellite imagery and
selectable field geometry provide a genuine spatial anchor").

The residual gap is the same architectural tension already identified and
documented for Today (`docs/visual-audit/rebuild/v1-today/AUDIT_LOG.md`):
the reference's full-bleed, edge-dominant map composition assumes the map
*is* the page. `/fields` is a different kind of screen — it combines farm-
level browsing (map + field list) with a real, functionally rich per-field
detail panel (`FieldDrawer.tsx`, 578 lines: Overview/Soil tabs, boundary
editing, compliance-evidence dropdowns, nutrient-plan navigation) that has
no equivalent in Today. Making the map genuinely full-bleed here would mean
either:

- Moving `FieldDrawer`'s real content into an overlay/sheet pattern (the
  fix Today's own round 8 used for its much smaller secondary-Prompts
  list) — but `FieldDrawer` is a primary, not secondary, surface on this
  screen, so hiding it behind a sheet risks making core field-management
  functionality harder to reach, not just restyling it; or
- Redesigning the farm-browsing / field-detail relationship into two
  distinct screens or a different navigation pattern entirely.

Either is a real information-architecture decision beyond this phase's
"preserve function, rebuild presentation" charter (`CLAUDE.md`'s primary
rule) — not a visual polish item a further audit round would resolve.
Per the rebuild brief's own §14, this is marked **BLOCKED_HUMAN on the
map-vs-detail-panel information architecture** and the programme continues
to Phase V3. `MapHero`'s own two real fixes this phase (paint refresh,
fly-to-selection) are durable and available to whichever future phase
revisits this screen's layout.
