# Task: CC-FU-A — correct slurry nutrient-credit messaging

TASK ID

cc-fu-a-slurry-credit-messaging-20261001

Starting HEAD: 29614a1
Verify command: `npm run typecheck && npm run build`

## Purpose

Fix the pre-existing UI/content issue logged as CC-FU-A.

Current wording can state "Slurry nutrient credit not included". This is inaccurate for
missing-soil-index slurry cases because valid slurry N credit may still be retained while
P and/or K credit is withheld. The UI must describe the actual nutrient-credit state truthfully.

## Scope

Identify every user-facing location that displays the blanket "Slurry nutrient credit not
included" or equivalent messaging derived from the same state. Trace the underlying
nutrient-plan / slurry assessment state before changing text.

Implement the smallest safe UI/content change that distinguishes slurry N credit retained and
slurry P/K credit withheld because soil-fertility evidence is missing, from cases where no
slurry nutrient credit is genuinely included.

Do not change nutrient calculations, the slurry engine, Campaign C scientific rules, the
missing-index behaviour established by CC-B2 / CC-B4A, or the engine version.

## Required behaviour

For a missing-index case where valid slurry N credit is retained and P/K credit is withheld,
the UI must not claim that all slurry nutrient credit was excluded. Use concise
farmer-readable wording based on existing state. For cases where all slurry credit truly is
unavailable, retain an accurate all-credit-withheld message.

If the UI cannot distinguish retained N from withheld P/K without changing frozen domain
contracts: BUILD_RESULT: BLOCKED UI lacks required nutrient-level state. Do not redesign
domain contracts in this task.

## Tests

1. Missing P/K soil indices with valid N credit: message does not say all slurry credit is
   excluded; retained N is represented truthfully.
2. Complete soil-index data: existing normal slurry-credit presentation remains unchanged.
3. Genuinely unavailable/unsupported slurry credit: UI still communicates that credit is not
   included where appropriate.

## Prohibited

Do not alter `nutrients.ts` scientific calculations or slurry availability factors; change
Campaign C; change rate/allocation architecture; modify CC-FU-B or CC-FU-C; modify
runner/harness code; modify migrations; push or deploy.

## Documentation

Mark CC-FU-A resolved in `docs/farm-return-next/BLOCKERS.md`; add only the minimum
implementation-log/state update. Leave CC-FU-B and CC-FU-C open and HR-F006/HR-F007 deferred.
