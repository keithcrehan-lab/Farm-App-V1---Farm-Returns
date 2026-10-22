# Claude audit 2026-10-22-1 — status

**FAILED · NOT ACCEPTED · NOT FROZEN · C10 STOPPED for architectural review**

| | |
|---|---|
| Auditor | Independent Claude audit (fresh read-only subagent, no implementation context). NOT Codex; NOT valid for runner freeze (`agent-campaign-run` requires `auditor: codex … tier=strict`). |
| Candidate / range | `8148e35` / `6e81831..8148e35` (full C10 delta) |
| Counts | Critical 0 / High 4 / Medium 5 / Low 4 |
| Reproduction | All 4 Highs reproduced independently by the coordinating session (probes p2, p3, p4, p8 rerun 2026-10-22; outputs match the report). Mediums/Lows not re-run by the coordinator. |
| Repairs applied | None |

## Why STOP rather than repair
The brief says "Stop for architectural review if repeated High findings indicate a systemic problem." Both families repaired in `8148e35` recurred at High in the very next audit:

- **UNAVAILABLE_AS_EMPTY / omission (F005 family)** — High in every C10 audit so far: 18870, 36620, 56621, 75774, 97274, and now CL-002 + CL-003. Each repair fixed the surface named and the next audit found a sibling surface.
- **INVALID_PROJECTION_AS_KNOWN (F014 family)** — repaired on the plan in `8148e35`; CL-001 is the same C5 output shown as a known "−93 kg" on the profile and chart.

The common cause: there is no single admitted read per engine output. The profile, chart, timeline, plan rows, sale-date source, save message and work card each interpret raw C5/C6/C9 output themselves. The static rules R1–R7 catch syntactic patterns, not this semantic duplication. Another spot repair would repeat the cycle. Decisions and the proposed structural repair are in `../C10_COMPLETION_CHECKPOINT.md`.
