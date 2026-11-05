# Schemes S3P2 — AI Scheme Adviser Retrieval Contract

Predecessor: S3P1 (frozen by `receipts/S3P1.json`)
Phase directories (new): `src/domain/schemes/adviser/`, `src/lib/schemes/adviser/`, `docs/product/schemes/adviser-ai/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (especially SCH-INV-010), `AUTONOMY.md`, `.agent/PRODUCT_RULES.md` and the S0 AI trust boundary.

## Objective

Define and build the AI adviser interface that consumes deterministic results and pinned sources only, so that no AI path can create or change an eligibility decision, value, deadline or requirement.

## Scope

- Grounding bundle builder: deterministic engine output, the requirement rows and pinned source passages for the exact scheme version, and farm context authorised server-side for the signed-in farm.
- Retrieval over pinned scheme source content only, with citations to source id, version and locator. If retrieval finds nothing, the adviser says so.
- A provider-neutral model port, and an honest unavailable state when none is configured. This phase adds no provider, SDK, credential or network call.
- Output validation: a response is shown only if each decision, figure, date and requirement it states matches the grounding bundle exactly and cites it. Otherwise it is rejected and the deterministic result is shown alone.
- Interface on the scheme detail page, always labelled as explanation, with the deterministic result displayed separately.
- Append one section to `DOMAIN_CONTRACTS.md`.

## Out of scope

- Connecting a real model provider, npm dependencies, secrets. Cross-scheme queries (S11P2).
- Persisting conversations, or any migration.
- AI writing facts, changing workflow state or creating Plan work.

## Acceptance criteria

- No code path lets model output alter engine results. This is shown by a type boundary and by tests.
- A stubbed model stating a different eligibility state, figure, date or requirement is rejected.
- A stubbed model with no citation, or citing another version's source, is rejected.
- Grounding never contains another farm's data; farm identity comes from the server.
- With no provider configured the page works and states that explanation is unavailable.

## Required tests

- Adversarial stub table: fabricated value, changed state, invented deadline, invented rule, wrong-version citation, prompt injection inside source text or a farmer note.
- Retrieval: version isolation and no-result honesty.
- Identity binding: client-supplied farm id is ignored.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the phase would need credentials or a provider; retrieval needs storage that requires a migration; adviser behaviour needs a product decision the S0 boundary does not settle.
