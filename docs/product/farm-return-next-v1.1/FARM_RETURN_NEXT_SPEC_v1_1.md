FARM RETURN NEXT

Product & UX  
Specification

The canonical source of truth for the Farm Return Next experience,
product behaviour, visual system and implementation sequence.

| **Version**               | 1.1               |
|---------------------------|-------------------|
| **Date**                  | 01 September 2026 |
| **Implementation branch** | farm-return-next  |

**North-star principle**

> “Open your farm, not an app.”

Farm Return should feel like a living, explorable farm world with a
prompt-led assistant underneath it. The farmer primarily looks, taps,
confirms and adjusts; the system observes, estimates, explains and
learns.

PRODUCT INTENT

# 1. Executive summary

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>What Farm Return Next is</strong></p>
<p>A software-first farm operating system that turns real farm context
into useful, timely actions. It should feel closer to exploring a game
world than operating an administrative dashboard, while remaining
scientifically honest and operationally useful.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

The product is organised around one behavioural loop:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Core loop</strong></p>
<p>Observe → Estimate → Prompt → Decide → Act → Confirm → Actual →
Learn</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Non-negotiable product rules

- The farm itself is the primary environment. Maps, fields, animals,
  jobs and contextual markers should carry navigation wherever
  practical.

- Today / Farm / Plan / Records remain the primary navigation.

- Ask AI is available from every primary screen and inherits only real,
  explicit current context.

- Data capture should be incidental: infer and pre-fill from GPS,
  weather, plans, telemetry, previous estimates and other trusted
  sources; ask the farmer mainly to confirm or correct.

- Prompts, Notifications and Gates/Constraints are separate product
  concepts and must not be forced into one shape.

- Satellite v1 provides relative vegetation intelligence and historical
  comparison, not exact kg DM/ha.

- Breeding & Births is species-aware from the outset: initial UX must
  support cattle, sheep and horses without hard-coding cattle-only
  terminology.

- Scientific outputs must expose provenance, confidence and uncertainty
  when relevant. Never fabricate precision.

- The approved visual direction is light, calm, premium and spatial —
  not a dark command centre or a conventional enterprise dashboard.

- Every material recommendation, cost and derived data point must be
  reproducible through a Calculation & Evidence Ledger that records
  inputs, units, formula/method, source, source version/date,
  calculation version, output, confidence and provenance.

- Ask AI explains and orchestrates validated engines; it must not become
  an alternative source of unverified agronomic, financial or regulatory
  calculations.

- Feed & Finish and Financial Intelligence are first-class connected
  capabilities: requirements, scenarios, costs, margins and Actuals must
  update one another rather than exist as isolated calculators.

- Farm Return may ingest current data from trusted internet sources, but
  scientific or regulatory logic cannot silently change. Source changes
  must be versioned, reviewed, tested and released through an approval
  workflow.

- Request Quote replaces a direct group-buying marketplace in the
  initial commercial model. Farm Return calculates demand and routes
  farmer-approved quote requests to suppliers; farmer and supplier
  transact directly and Farm Return does not initially handle customer
  funds.

## Immediate implementation objective

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>First demonstrable Farm Return Next
experience</strong></p>
<p>A farmer opens the living farm world, receives a real Prompt, acts on
it, completes a real GPS-supported job, confirms the Actual, sees the
Record, and can ask AI about any part of that flow.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

IMPLEMENTATION BASELINE

# 2. Current build position

This specification starts from the current farm-return-next branch
rather than from a greenfield product. The architecture already shipped
should be reused, not replaced.

| **Area**                         | **Status**                                   | **Implication**                                                                               |
|----------------------------------|----------------------------------------------|-----------------------------------------------------------------------------------------------|
| Framework / shared contracts     | Complete                                     | Preserve the existing Next orchestration model and contracts.                                 |
| Decisions / jobs migrations      | Applied in Dev; validation still outstanding | Run the hardened RLS validation against real Dev and only then promote to VALIDATED_DEV.      |
| Vertical A — Observe / telemetry | Backend shipped and audited clean            | telemetry_events, retention cron and durable farm-scoped IndexedDB outbox exist.              |
| Vertical G — Notifications       | Backend shipped and audited clean            | Lifecycle/state-machine exists; UI must be designed around real Prompt-derived notifications. |
| Vertical H — Satellite           | Real Sentinel-2 scene discovery shipped      | Use real scenes; vegetation computation must not imply biomass precision.                     |
| Vertical B — Prompts             | Multiple real Prompt candidates shipped      | Use a genuine Prompt for the first end-to-end workflow.                                       |
| Visual UI references             | Approved                                     | The lighter mock-ups in this document are canonical direction.                                |

## Known outstanding technical actions

**1.** Run supabase/validation/decisions_jobs_rls_validation.sql against
the real Dev database and confirm PASS.

**2.** If and only if validation passes, promote the relevant migration
status to VALIDATED_DEV.

**3.** Apply the telemetry, retention-job and notifications migrations
to Dev if they are not yet applied; verify real database state.

**4.** Do not make NDVI/vegetation estimates depend on unavailable CDSE
credentials unless the implementation explicitly requires authenticated
downstream processing.

**5.** Do not surface the P-build-up eligibility check as a Prompt.
Treat it as a Gate/Constraint until a deliberate product decision
changes that.

DESIGN LANGUAGE

# 3. Canonical visual direction

The visual system should borrow the interaction principles of strong
open-world and mission-hub games — spatial navigation, contextual
overlays, progressive disclosure and an “alive” world — without copying
their aesthetic or becoming theatrical.

<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Borrow</strong></p>
<p>World as interface; spatial points of interest; restrained HUD;
mission-like actions; clear active-task mode; environmental
context.</p></th>
<th><p><strong>Avoid</strong></p>
<p>Dark tactical dashboards; heavy chrome; badge gamification; dense KPI
grids; fake 3D; decorative complexity; GIS-tool language.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Approved light visual system

- Warm off-white / light neutral base surfaces.

- Restrained agricultural greens for primary actions, selected states
  and positive readiness.

- Satellite/aerial imagery provides visual depth; cards should remain
  light and legible over it.

- Serif/display type may be used for high-level page/field headings;
  clean sans-serif for functional information and numbers.

- Rounded cards, subtle borders, soft shadows; avoid heavy glassmorphism
  in the light theme.

- Amber is reserved for attention/needs-confirmation; red/orange only
  for genuine restriction or risk; blue may indicate
  informational/data-source states.

- Icons and markers should be simple, recognisable and consistent across
  Today, Farm, Plan and Records.

- Ask AI appears as a persistent but secondary affordance; it should be
  easy to reach without competing with the primary action.

<img
src="/mnt/data/Farm_Return_Next_Claude_Bundle_v1_1/media/image1.png"
style="width:6.55in;height:8.18458in" />

Approved direction: light, calm Farm Return system across Plan, Records,
Livestock, Prompts, Constraints, Input Planning, Satellite and
contextual AI.

WORLD STRUCTURE

# 4. Information architecture and navigation

| **Primary area** | **Question it answers**                                 | **Primary interaction**                                                                                  |
|------------------|---------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Today            | What matters on my farm right now?                      | See the living farm state, current Prompt(s), nearby context, ready work, active jobs and confirmations. |
| Farm             | What is happening in this place / field / animal group? | Explore spatially from farm → field / yard / livestock group → intelligence → action.                    |
| Plan             | What is ahead and when should I do it?                  | Review Today / Tomorrow / This week, planned jobs, genuine opportunities and windows.                    |
| Records          | What actually happened?                                 | Review activity timeline, provenance, Estimated vs Actual, and open any record in context.               |

## Navigation hierarchy

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Spatial first</strong></p>
<p>Farm portfolio (if applicable) → Farm → Field / yard / livestock
group → Prompt / job / observation / record → detail. Secondary modules
should not become the primary mental model.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Canonical screen set

| **\#** | **Screen archetype**                | **Role**                                                                                                                     |
|--------|-------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| 1      | Today / Living farm world           | Home state, real Prompt(s), nearby/active work and immediate next action.                                                    |
| 2      | Farm / Field exploration            | Spatial exploration and contextual field intelligence.                                                                       |
| 3      | GPS Job Mode                        | Minimal active-task experience during physical work.                                                                         |
| 4      | Confirm Actual                      | Estimated vs Actual close-out and learning input.                                                                            |
| 5      | Plan                                | Upcoming work, windows, suggestions and commitments.                                                                         |
| 6      | Records                             | Activity/history timeline with provenance and actual status.                                                                 |
| 7      | Livestock world                     | Groups/animals anchored to paddocks, sheds and herd state.                                                                   |
| 8      | Breeding & Births                   | Species-aware breeding windows, pregnancy evidence and expected births.                                                      |
| 9      | Soil / scientific detail            | Data-rich but readable science, provenance and constraints.                                                                  |
| 10     | Satellite / vegetation intelligence | Relative vegetation pattern, change, history and ground inspection.                                                          |
| 11     | Expanded Prompt / Why this matters  | Evidence, confidence, explanation and recommended action.                                                                    |
| 12     | Gate / Constraint                   | Clear restriction, reason, evidence and permitted next step.                                                                 |
| 13     | Input Planning                      | Forecast needs, timing, secured quantities and bulk-buy opportunity.                                                         |
| 14     | Ask AI contextual overlay           | Query the exact context currently being viewed.                                                                              |
| 15     | Feed & Finish                       | Livestock feed requirement, finishing target, feed inventory, scenario comparison and estimated/actual cost.                 |
| 16     | Financial Intelligence              | Whole-farm and enterprise profitability, cost/revenue forecasts, scenarios and Estimate vs Actual.                           |
| 17     | Calculation & Evidence              | Trace any material number back through inputs, source, formula/model, version, confidence and provenance; export report.     |
| 18     | Quote & Procurement                 | Review calculated need, request a delivered supplier quote, compare/accept and update the plan with real quoted/actual cost. |

CORE PRODUCT LOGIC

# 5. Behavioural model and interaction taxonomy

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Canonical activity lifecycle</strong></p>
<p>Suggested → Planned → Window approaching → Ready → In progress /
Active → Completed—estimated → Completed—actual / confirmed</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Prompt

A Prompt asks the farmer to make or review a decision. It must be
grounded in real evidence or domain logic and should have a meaningful
response such as accept, plan, edit, dismiss or inspect.

- Examples: spreading window, ageing soil test, commonage status,
  repeated vegetation anomaly worth checking.

## Notification

A Notification informs the farmer that something happened, changed or
now needs attention. It is not a substitute for a decision surface.
Notification copy must originate from real Prompt/lifecycle state; do
not invent unsupported events.

## Gate / Constraint

A Gate tells the farmer that something is not permitted, not supported
or conditional — and why. It is not an accept/edit/dismiss Prompt.

- Example: P build-up eligibility not met.

- Show what is restricted, the relevant criteria/evidence, and what is
  still permitted.

## Observation

An Observation is evidence about the farm state: GPS presence, telemetry
event, satellite variation, farmer note/photo/voice, weather observation
or other trusted signal. Observations can lead to Estimates or Prompts,
but do not automatically become decisions.

INTERACTION PRINCIPLE

# 6. Effortless data capture

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Default farmer interaction</strong></p>
<p>Look → tap → confirm → adjust. Avoid search → form → multi-field
entry → save wherever a trusted estimate or inference can pre-fill the
answer.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Signal**                    | **What Farm Return may infer**                                              | **Farmer interaction**                                                             |
|-------------------------------|-----------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| Phone GPS                     | Current field, movement, likely field entry/exit, job duration/area context | Confirm job / wrong field / not now; correct if needed.                            |
| Weather + timing              | Readiness windows or constraints                                            | Review Prompt; plan or defer.                                                      |
| Existing plan / estimate      | Likely job type, field, rate, expected quantity                             | Confirm or edit.                                                                   |
| Telemetry / Drive later       | Machine identity/activity evidence                                          | Usually passive; surface only when it changes confidence or requires confirmation. |
| Satellite scene               | Relative vegetation variation and change                                    | Inspect highlighted area; log ground observation.                                  |
| AI docket / uploaded document | Potential service date, sire, animal, result                                | Confirm extracted data; never silently commit uncertain facts.                     |
| Vet / pregnancy scan          | Confirmed pregnancy and refined gestational estimate                        | Record evidence and update expected birth window.                                  |

## Provenance requirements

- Every important value should distinguish estimate, inferred
  observation and confirmed actual where relevant.

- Show source labels selectively (GPS-recorded, farmer-confirmed,
  satellite observation, vet scan, uploaded document, etc.).

- Confidence should increase when stronger evidence arrives; later
  evidence must not erase the history of earlier estimates.

- If required data is absent, fail closed: ask, defer or explain that an
  estimate cannot be made.

CROSS-CUTTING INTELLIGENCE

# 7. Ask AI — available everywhere

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Global rule</strong></p>
<p>Every primary screen must provide an Ask AI affordance. The assistant
receives only the explicit current context technically available on that
screen. Context is never invented.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Current screen** | **AI context supplied**                                          | **Example question**                              |
|--------------------|------------------------------------------------------------------|---------------------------------------------------|
| Today              | Farm + visible Prompt/job/notification summary                   | “What should I prioritise this morning?”          |
| Field 7            | Field ID, real soil/activity/plan/constraint/satellite context   | “When did I last spread this field?”              |
| Expanded Prompt    | Prompt, evidence, Estimate and confidence                        | “Why are you recommending this?”                  |
| GPS Job Mode       | Active job + current field + real tracking state                 | “What rate did I plan for this job?”              |
| Record             | Selected activity + Estimate/Actual + provenance                 | “How did this compare with the last application?” |
| Satellite          | Selected field, scene dates, derived relative pattern/change     | “Why might this corner be worth inspecting?”      |
| Breeding & Births  | Selected species/group/animal and recorded reproductive evidence | “Which animals are due first?”                    |
| Input Planning     | Visible forecast and secured quantities                          | “What am I short of for spring?”                  |

## AI behaviour rules

- Answer from Farm Return data first; distinguish retrieved facts from
  general agronomic knowledge.

- Never convert missing farm context into a confident farm-specific
  claim.

- When a question could change a regulated, veterinary or high-impact
  decision, explain the evidence and uncertainty rather than presenting
  the AI response as authority.

- Where useful, let AI create a proposed observation, plan or draft
  action — but require explicit farmer confirmation before committing
  farm records.

- Ask AI must work as an overlay or bottom sheet so the farmer does not
  lose their place in the world.

PRIORITY EXPERIENCE

# 8. Today, Farm and the first complete job loop

## Today / Living farm world

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Visual-reference note</strong></p>
<p>The following early dark mock-ups are interaction and composition
references only. Their colour treatment is superseded by the approved
light visual system in Section 3. Implement these layouts in the light
theme.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- Aerial/world view is the hero visual, with fields and yard acting as
  interactive places.

- Primary card: “What matters now”. One strongest genuine action, not a
  feed of everything.

- Spatial markers may show Ready, Active, Needs confirmation,
  informational or constraint states.

- A concise status strip may summarise ready jobs, active jobs and jobs
  awaiting confirmation.

- Location-aware card may say “Looks like you’re near Back Meadow” when
  real GPS context supports it.

- Weather is ambient context and should only dominate when it materially
  affects an action.

<img
src="/mnt/data/Farm_Return_Next_Claude_Bundle_v1_1/media/image2.png"
style="width:3.65in;height:6.48544in" />

Interaction reference only — Today as a living farm world. Restyle in
the approved light visual system.

## Field exploration

- Tap a field to zoom into its current state rather than navigating to a
  generic module.

- Context tabs may include Now, Soil, Activity and Constraints;
  satellite intelligence is available where real scenes exist.

- Prominent action should reflect the actual current state: Plan job,
  Start job, Inspect area, Review constraint, etc.

- Scientific detail is progressively disclosed; do not put all farm
  metrics on the initial field surface.

<img
src="/mnt/data/Farm_Return_Next_Claude_Bundle_v1_1/media/image3.png"
style="width:3.65in;height:6.48544in" />

Interaction reference only — selected field as an explorable place.
Restyle in the approved light visual system.

## GPS Job Mode

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Design rule</strong></p>
<p>Starting a physical job should feel like entering an active mode, not
opening a form.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

- Show job type, field and active state prominently.

- Show elapsed time, GPS/tracking status and area/coverage only where
  they are genuinely measured or derived.

- Minimise controls to Pause, Finish and essential map controls.

- Do not fabricate machine rate, exact coverage passes or sensor values.
  Planned/target values must be labelled as such.

- When movement/context suggests completion, Farm Return may prompt the
  farmer to finish rather than silently completing the job.

<img
src="/mnt/data/Farm_Return_Next_Claude_Bundle_v1_1/media/image4.png"
style="width:3.65in;height:6.48544in" />

Interaction reference only — focused active-job mode. Restyle in the
approved light visual system.

## Confirm Actual

- Completion creates a Completed—estimated state first.

- Show Estimated and proposed Actual side by side for the key job
  values.

- Pre-fill Actual from the best real evidence available, but make it
  easy to edit.

- The primary action is Confirm actual; secondary actions are Edit and
  Save later.

- Once confirmed, the activity becomes Completed—actual / confirmed and
  appears in Records.

- Preserve the estimate/actual difference for later calibration and
  confidence learning.

<img
src="/mnt/data/Farm_Return_Next_Claude_Bundle_v1_1/media/image5.png"
style="width:3.65in;height:6.48544in" />

Interaction reference only — Estimated → Actual close-out. Restyle in
the approved light visual system.

CORE SUPPORTING SCREENS

# 9. Plan and Records

## Plan

- Organise around Day / Week / Month with strong emphasis on Today,
  Tomorrow and This week.

- Separate committed planned work from genuine
  opportunities/suggestions.

- A weather window is useful only if tied to real domain logic and a
  real action.

- Selecting a planned item should return the user to the relevant
  farm/field context where possible.

- Avoid a generic calendar-first implementation.

## Records

- Default view is a chronological activity timeline, not a spreadsheet
  register.

- Each item identifies activity, field/group, date/time, core quantity,
  and provenance/status.

- Clearly distinguish estimated-only, awaiting confirmation and
  confirmed actual records.

- Opening a record should reveal the connected field/map context,
  evidence, Estimate/Actual values and related Prompt/decision where
  available.

- Filters may exist, but they remain secondary to the readable history.

SPECIES-AWARE FARM STATE

# 10. Livestock world

Livestock must fit the world-first model rather than becoming a separate
spreadsheet product. Groups and animals should be anchored to paddocks,
sheds or management groups when location/context is known.

- Overview may show animal/group counts spatially on the farm map.

- Primary concepts: group, species, current location, lifecycle/status,
  recent movement/activity, upcoming action.

- Allow movement between group-level and individual-animal detail
  depending on the species and farming system.

- Cattle may mix group and individual management; sheep should strongly
  support batch/group workflows; horses usually require richer
  individual-animal views.

- The same visual language must support health, movements, breeding and
  other later livestock workflows without creating a second app inside
  Farm Return.

## Breeding & Births

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Product rule</strong></p>
<p>Do not build a cattle-only “pregnancy screen”. Build one
species-aware Breeding &amp; Births engine whose terminology, evidence
model and group/individual behaviour adapt to the animal.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Species** | **Primary planning shape**                           | **Typical evidence progression**                                                         | **Birth terminology** |
|-------------|------------------------------------------------------|------------------------------------------------------------------------------------------|-----------------------|
| Cattle      | Target calving window; individual or breeding group  | Bull exposure / AI service → pregnancy confirmation / scan / vet estimate → actual birth | Calving               |
| Sheep       | Target lambing period; strongly group/batch oriented | Ram in/out → pregnancy scan → singles/twins/triplets → actual lambing                    | Lambing               |
| Horses      | Individual mare and desired foaling window           | Cover / AI → reproductive scans / vet evidence → actual foaling                          | Foaling               |

## Breeding logic

- The farmer can start from the desired outcome: e.g. target
  calving/lambing/foaling period. Farm Return works backwards to
  estimate the breeding window using species-configured domain logic.

- Once a service/AI/covering or ram/bull exposure is recorded, calculate
  an estimated birth window and label it as an estimate.

- When stronger evidence arrives — AI record, pregnancy scan, vet
  gestational estimate, etc. — refine the expected birth window and
  increase confidence.

- Actual calving/lambing/foaling closes the loop and is preserved as the
  actual outcome.

- Do not hard-code a single gestation number into the UX. Gestation
  logic belongs in an authoritative species/domain layer and may account
  for breed/individual variation where supported.

## Breeding screen structure

- Header: Breeding & Births + selected species/group.

- Seasonal/timeline hero: target birth period, estimated breeding
  window, confirmation/scan period and expected birth period.

- Primary card: “18 cows approaching breeding window”, “126 ewes —
  ram-in window approaching”, or “Mare Willow — scan due”.

- Group summary: confirmed pregnant / awaiting evidence / empty /
  unknown; sheep may additionally show scanned litter-size distribution.

- Individual animal detail: service/cover evidence, expected birth
  window, confidence and upcoming action.

- Ask AI can answer queries such as “Which are due first?”, “Which ewes
  still need scanning?” or “When should I breed for a March lambing
  start?” based on real recorded context.

EARLY PRODUCT BOUNDARY

# 11. Satellite / Vegetation Intelligence

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>V1 capability</strong></p>
<p>Relative vegetation intelligence: see stronger/weaker parts of a
field, compare usable scenes over time, identify persistent
underperforming zones and guide ground inspection. It is not an exact
biomass or kg DM/ha feature yet.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Core screen

- Header: field name, area, latest usable scene date, source and
  image-quality/cloud status.

- Layer switch: Satellite / Vegetation / Change / History.

- Vegetation view uses relative language: Lower ← Typical → Higher. Do
  not label lower vegetation as a diagnosis by itself.

- Tap a zone to reveal relative performance and known contextual farm
  information; do not claim causal diagnosis unless supported by a real
  model/evidence.

- Insight card can describe pattern (e.g. Uneven), approximate affected
  area, and comparison with the field.

- History shows clear and unavailable/cloudy scenes transparently; do
  not cherry-pick or hide unusable dates.

- Change mode compares valid scenes and may show relative strengthened /
  stable / lower-response areas.

- Primary action for a persistent anomaly is Inspect area / Log
  observation, closing the satellite → ground truth loop.

<img
src="/mnt/data/Farm_Return_Next_Claude_Bundle_v1_1/media/image6.png"
style="width:4.15in;height:6.225in" />

Interaction/logic reference — relative vegetation map, history,
explanation and ground inspection. Restyle in the approved light visual
system.

## Scientific boundaries

| **Allowed now**                                                                                                                                                                      | **Deferred until scientifically validated**                                                                                                                    |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Latest usable real scene; relative within-field variation; historical comparison; change detection; approximate affected area; observational Prompt; farmer ground note/photo/voice. | Exact kg DM/ha; tonnes DM; exact grass-growth rate; precise yield forecast; feed wedge values; causal agronomic diagnosis; pseudo-precise fertiliser response. |

DATA-HEAVY PATTERNS

# 12. Scientific detail, Input Planning and Constraints

## Soil / scientific detail

- Show real result, unit, source/date and whether a value is measured or
  estimated.

- Use clear P/K/pH and other agronomic values, trend/history and
  relevant recommendation without burying the user in raw calculation
  tables.

- Provide “Why?” and Ask AI access to evidence, assumptions and
  confidence.

- Regulatory constraints should surface in context, not as surprising
  failures at the final save step.

## Input Planning

- Forecast what the farm needs to buy from mapped land, soil/fertiliser
  plans, silage/crops, livestock, housing, feed, slurry/organic
  nutrients and financial assumptions.

- Show needed quantity, secured quantity, timing and the
  confidence/source of the forecast.

- Surface bulk-buy opportunities as a commercial layer without
  compromising the correctness of agronomic recommendations.

- Allow farmers to adjust assumptions; preserve the relationship between
  forecast and eventual actual purchase/use.

## Gate / Constraint pattern

- Title the restriction plainly: e.g. “P build-up not permitted”.

- Explain what the restriction affects and what remains permissible.

- Show the real eligibility criteria and which are met/not met when
  available.

- Offer View details / I understand / Ask AI — not accept/edit/dismiss
  as if it were a Prompt.

- A constraint may influence or block a planned action, but should
  retain its own lifecycle and provenance.

CONSISTENCY RULES

# 13. Scientific Validation, Calculation & Evidence Ledger

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>System rule</strong></p>
<p>No material recommendation is complete unless Farm Return can show
where it came from. The app must be able to produce an evidence chain
that an independent Irish agricultural expert can reproduce and
audit.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Evidence classification

- Measured Actual — laboratory, scale, sensor, vet, soil test or other
  direct measurement.

- Farmer Actual — confirmed activity, quantity, price, date, observation
  or outcome entered/confirmed by the farmer.

- Authoritative External Data — current approved data from trusted
  Irish/EU sources or licensed providers.

- Derived Estimate — output produced by a defined and versioned
  calculation/model from known inputs.

- Assumption — an explicit fallback used only because better evidence is
  unavailable; it must remain visible as an assumption.

## Calculation identity and reproducibility

Every material formula or model must have a stable calculation ID and
version. Reports must preserve the exact inputs, units, transformations,
source references, model version and price/data snapshots used at the
time, so an older result can still be reproduced after sources or models
change. Historical calculations must never silently rebase onto newer
coefficients.

| **Ledger field**         | **Required content**                                       | **Example treatment**                               |
|--------------------------|------------------------------------------------------------|-----------------------------------------------------|
| Calculation ID / version | Stable identity for the formula/model and released version | FR-BEEF-FEED-014 / v1.2                             |
| Inputs                   | Value, unit, evidence type and timestamp                   | 20 animals; 600 kg measured/confirmed               |
| Source                   | Authoritative document/dataset/API and source version/date | Approved Teagasc/DAFM/CSO/Met Éireann source record |
| Method                   | Formula, lookup, coefficient set or model path             | Explicit calculation, not hidden AI reasoning       |
| Output                   | Value, unit, Estimate/Actual state                         | 10.0 t concentrate — Estimated                      |
| Confidence               | High / Medium / Low plus reason                            | Reduced if feed analysis is missing                 |
| Review state             | Draft / validated / expert-reviewed / superseded           | Model release status                                |

## Expert validation framework

- Validate models at the engine/version level rather than requiring an
  expert to review every farmer report.

- Give the relevant specialist a validation pack containing every
  formula, coefficient, lookup table, source, assumption, scenario test,
  boundary condition and known limitation.

- Use domain-appropriate reviewers: ruminant nutrition, soils/nutrients,
  veterinary/reproduction, grassland, agricultural economics and
  regulation as applicable.

- Record reviewer identity/role, review date, findings, approval status
  and model version. Do not claim independent expert validation until it
  has genuinely occurred.

- A source update can create a review requirement; it must not
  automatically mutate a released scientific model.

## Source hierarchy and freshness

| **Tier** | **Preferred source class**                                                                                | **Rule**                                                                                           |
|----------|-----------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| 1        | Irish/EU law and regulation; DAFM / Irish Statute Book                                                    | Controls compliance logic and overrides non-regulatory guidance.                                   |
| 2        | Irish authoritative technical data: Teagasc, ICBF, DAFM, CSO, Met Éireann, EPA, Bord Bia where applicable | Preferred technical/market/public-data foundation.                                                 |
| 3        | Peer-reviewed science                                                                                     | Use where authoritative Irish guidance is absent or a validated model requires it.                 |
| 4        | Farm-specific evidence                                                                                    | Lab tests, weights, scans, soil tests, invoices, supplier quotes, confirmed jobs and observations. |
| 5        | Explicit assumptions                                                                                      | Fallback only; disclose and downgrade confidence.                                                  |

## Generated Calculation & Evidence Report

- The farmer must be able to generate a human-readable PDF/report for a
  field, animal/group, plan, recommendation, job, financial forecast or
  whole-farm view.

- The report should show Result → Inputs → Source → Method/Formula →
  Output → Confidence → Estimate/Actual status → model/source versions.

- A report should flag stale sources, missing inputs and assumptions
  rather than disguising them as verified facts.

- Ask AI may explain any calculation in plain language by reading the
  ledger; it may not independently replace the validated engine with an
  LLM-generated recommendation.

# 14. Financial Intelligence

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Financial principle</strong></p>
<p>Operational decisions and financial consequences are one system. Farm
Return should estimate the cost/return of a plan before it happens,
replace assumptions with quotes and Actuals as evidence improves, and
preserve the provenance of every important financial value.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Required financial capability

- Whole-farm and enterprise-level profitability for the farm types
  supported by the product.

- Field/activity costs where attribution is defensible; input, feed,
  veterinary, contractor, housing and other connected costs.

- Livestock purchase/sale values and expected sale timing where entered
  or connected to approved market/reference data.

- Estimated versus Actual cost and revenue, including variance and
  explanation.

- Gross margin / contribution views, cash-flow forecasting and scenario
  planning.

- Per-head, per-hectare or per-unit-production metrics only where
  definitions and allocation methods are explicit and
  scientifically/financially valid.

- Ask AI can change scenario assumptions in natural language, but the
  financial engine performs the arithmetic and the Evidence Ledger
  records the result.

## Financial provenance

Every price must identify its origin: farmer-entered actual invoice,
supplier quote, contracted price, approved external benchmark or
explicit assumption. Time-sensitive prices retain their
observation/quote date. A later market update must not alter a
historical plan or Actual.

# 15. Feed & Finish Intelligence

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Product question</strong></p>
<p>Given these animals, their current state, the target
finish/birth/production goal, the feed available and current prices:
what feed is required, do I have enough, what realistic strategies
exist, and what does each strategy cost?</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Core planning flow

- Start from a group/animal state such as animal class, sex, current
  liveweight, age where relevant, housing date, physiological state and
  farm-recorded history.

- Allow the farmer to specify an outcome such as target finish date,
  target liveweight or other scientifically supported goal. Work
  backwards to the required performance rather than forcing a
  feed-entry-first workflow.

- Use feed inventory and quality: silage/pit/bales, dry matter, DMD,
  crude protein and other analysis where scientifically relevant;
  concentrates/ration composition and price; minerals and other feed
  inputs.

- Calculate total feed requirement, daily rate where valid, total
  tonnes/bales, projected depletion/reserve/deficit and estimated total
  cost.

- Offer realistic scenario comparisons such as forage-led / target-date
  / faster-finish only when supported by a validated model. Show the
  trade-off in feed, finish date, cost and projected financial result.

- If a requested target is not supported by the available feed/model
  evidence, Farm Return must say so rather than manufacturing a plan.

## Breed and type refinement

Breed/type must be supported architecturally as an optional refinement
rather than a V1 blocking input. Begin with robust animal-class/type
assumptions, then allow broader categories and later
breed/cross-specific modifiers only when validated evidence exists.
Unknown breed must remain usable with clearly stated baseline
assumptions. Over time, reliable farm-specific Actual performance may
calibrate future estimates without erasing the scientific baseline.

## Estimate → Actual learning

The feed plan must retain its original forecast and compare it with
actual feed used, actual finishing date, actual weight/performance and
actual cost. These differences become farm evidence for later
calibration and financial review; they do not justify arbitrary model
self-modification.

## Cross-species architecture

Design the underlying feed-requirement contract around species, animal
class, physiological state, weight, target, environment, feed quality
and availability. Validate one deep initial implementation before
expanding shallowly. Cattle Feed & Finish can be the first
expert-reviewed exemplar; sheep and horses reuse the framework with
species-appropriate science and terminology.

# 16. Trusted Data Update Layer

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Connectivity principle</strong></p>
<p>Farm Return should be cloud-connected but offline-capable. Internet
connectivity keeps approved data current; it must not allow an AI agent
or external webpage to silently rewrite scientific or regulatory
logic.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Three update classes

| **Class**                     | **Examples**                                                                                   | **Update rule**                                                                                                                 |
|-------------------------------|------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| Live / operational            | Weather observations/forecast; satellite scene discovery; other approved live feeds            | Automated ingestion after schema/licence validation; timestamp every observation.                                               |
| Reference / market            | CSO/market benchmarks, input price indices, approved reference datasets                        | Automated or scheduled versioned snapshots; retain history.                                                                     |
| Scientific / regulatory logic | Nutrient tables, feed coefficients, legislation, breed modifiers, gestation/reproduction logic | Detect change → review → test → expert/owner approval where required → release new version. Never auto-mutate a released model. |

## Source Registry and monitoring

- Maintain a Source Registry containing source owner, URL/API/dataset
  identifier, licence/usage status, schema/version, refresh cadence,
  last successful sync, affected calculations and review status.

- Store immutable raw/versioned snapshots where needed for
  reproducibility before transforming data into an approved current
  layer.

- A Source Monitor may detect newly published guidance or regulations
  and create a review item. It must not interpret and publish new
  scientific coefficients autonomously.

- Expose data currency in the app/report when it matters: observation
  time, market-data period, regulation/model version and last scientific
  review.

- Offline-first behaviour remains mandatory for farm work: active jobs
  and recent/required farm state continue locally and sync through the
  durable outbox when connectivity returns.

# 17. Quote & Procurement Intelligence

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Initial commercial model</strong></p>
<p>Request Quote is the farmer-facing purchasing feature. Farm Return
calculates a genuine need, the farmer chooses whether to request a
quote, approved suppliers quote the farmer, and the farmer
pays/transacts directly with the supplier. Farm Return does not hold
customer funds in the initial version.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Farmer workflow

- Input Planning or Feed & Finish produces the product, quantity, timing
  and delivery need from the farm plan.

- The farmer reviews the requirement and explicitly taps Request Quote;
  Farm Return never sends a commercial enquiry without consent.

- The request carries only the approved minimum farm/delivery context
  required to price the job. Farmer identity/contact sharing must follow
  explicit consent and privacy rules.

- One or more approved suppliers return a delivered quote with product,
  unit price, delivery terms, validity period and total price.

- The farmer may accept/contact the supplier. The commercial contract
  and payment are directly between farmer and supplier in the initial
  model.

- A received quote can replace a benchmark assumption in the Financial
  plan after farmer confirmation; an eventual invoice/actual purchase
  can replace the quote as Actual.

## Economies of scale without a buying-group UX

Farm Return may aggregate anonymised, consent-compatible demand across
farms by product, region and delivery window to negotiate stronger
supplier pricing or commercial arrangements. The farmer still receives
an individual delivered quote. Aggregated demand must not expose
identifiable farm information outside the approved workflow.

## Supplier commercial model

- Initial preference: a success-based supplier referral/commission fee
  or another transparent supplier-funded commercial arrangement.

- Avoid charging the farmer simply to request a quote in the initial
  model unless product strategy is explicitly changed.

- Online/in-app payment, invoicing, financing and order settlement are
  deferred capabilities. Design contracts so they can be added later
  without making Farm Return the merchant of record today.

# 18. States, labels and status language

| **State**                       | **Meaning**                                          | **UI treatment**                                 |
|---------------------------------|------------------------------------------------------|--------------------------------------------------|
| Suggested                       | System proposes something worth considering          | Contextual Prompt; low commitment.               |
| Planned                         | Farmer has accepted/created future work              | Visible in Plan and field context.               |
| Window approaching              | Timing is becoming relevant                          | Subtle attention; may notify if appropriate.     |
| Ready                           | Conditions / timing satisfy the real readiness logic | Clear primary action; green readiness state.     |
| Active                          | Job is in progress                                   | Focused GPS Job Mode; minimise unrelated UI.     |
| Completed—estimated             | Work appears finished but Actual is not confirmed    | Amber / needs confirmation.                      |
| Completed—actual                | Farmer confirmed the real outcome                    | Stable record / green confirmation.              |
| Constraint                      | Action is restricted/conditional                     | Amber/red-orange based on severity; explain why. |
| Unknown / insufficient evidence | Farm Return cannot support a confident state         | Neutral; explicitly say what is missing.         |

## Language rules

- Prefer farmer-facing language over system jargon.

- Do not imply certainty with words such as “will”, “definitely” or
  exact-looking numbers when the value is estimated.

- Use “Estimated”, “Likely”, “Relative”, “Based on”, “Confidence” and
  “Source” where they materially improve understanding.

- Avoid generic “Success” toasts for meaningful farm events; show the
  actual state change instead.

BUILD ORDER

# 19. Implementation sequence

| **Phase** | **Deliverable**                              | **Exit criterion**                                                                                                                                              |
|-----------|----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0         | Dev database validation / migrations         | RLS script genuinely passes Dev; newer migrations applied and verified, or blocker recorded.                                                                    |
| 1         | Canonical visual tokens/patterns             | Light theme, typography, states, cards, map markers, Ask AI and loading/error states documented and reusable.                                                   |
| 2         | Today / Living farm world                    | Real farm state and genuine Prompts surface without fabricated data.                                                                                            |
| 3         | Farm / Field exploration                     | Farm → field → state/intelligence/action works with real domain data.                                                                                           |
| 4         | One complete physical-job loop               | Real Prompt → Plan/Job → GPS mode → Complete → Confirm Actual → Record works end-to-end.                                                                        |
| 5         | Plan                                         | Upcoming work/opportunities reflect real state and link back to context.                                                                                        |
| 6         | Records                                      | Timeline and full record detail reflect real provenance and Actual status.                                                                                      |
| 7         | Contextual Ask AI                            | Every implemented primary screen provides explicit, fail-closed context to AI.                                                                                  |
| 8         | Livestock + Breeding & Births                | Species-aware group/individual patterns implemented without cattle-only schema assumptions.                                                                     |
| 9         | Satellite / vegetation UI                    | Real scene discovery + honest relative vegetation/change/history; no biomass claims.                                                                            |
| 10        | Soil / Constraint / Input Planning expansion | Data-heavy patterns reuse the approved design system and real engines.                                                                                          |
| 10        | Scientific Validation + Evidence Ledger      | Calculation IDs/versioning, evidence/source registry and report contract exist before new recommendation engines are considered complete.                       |
| 11        | Financial Intelligence                       | Connected Estimate/Actual financial model and scenario interface with explicit price provenance.                                                                |
| 12        | Feed & Finish                                | First deeply validated animal/feed planning engine, including feed inventory, scenarios, cost and evidence report; breed/type supported as optional refinement. |
| 13        | Trusted Data Update Layer                    | Approved source registry, update classes, versioned ingestion and source-change review workflow.                                                                |
| 14        | Quote & Procurement                          | Request Quote from calculated need; supplier-direct transaction; quote can update financial estimate; no Farm Return-held funds.                                |

## Do not optimise for

- Maximum number of screens implemented in one session.

- Placeholder content that makes a mock-up look complete.

- A generic component library detached from Farm Return behaviour.

- Adding new backend verticals before the first end-to-end farmer
  journey works.

- Matching the reference mock-ups pixel-for-pixel where the reference
  contains illustrative rather than real data.

DEFINITION OF DONE

# 20. Quality and acceptance gates

## Every phase must

- Inspect existing architecture and contracts before implementation.

- Reuse real domain engines and data; no invented scientific values or
  fake farm records.

- Handle loading, empty, denied-permission, offline and error states
  intentionally.

- Pass typecheck, lint, tests and build required by the repo.

- Audit mobile layout, tap targets, contrast, readable map overlays and
  keyboard/screen-reader basics where applicable.

- Test state transitions rather than only static rendering.

- Audit the implementation critically, fix findings and commit only
  clean work to farm-return-next.

- Never touch main or production unless explicitly instructed later.

## First milestone acceptance test

**1.** Open Today and see real farm state plus at least one genuine
Prompt.

**2.** Open the Prompt and understand why it exists from real supporting
evidence.

**3.** Accept/plan the action and create a real job/activity.

**4.** Enter GPS Job Mode with the correct farm/field/job context.

**5.** Finish the job and enter Completed—estimated.

**6.** Review and confirm/edit Actual values.

**7.** Find the Completed—actual record in Records.

**8.** Use Ask AI from at least Today, Field, Prompt, active job or
Record and verify it receives only the relevant explicit context.

**9.** Demonstrate failure behaviour when data/context is absent rather
than hallucinating a result.

10\. For every material derived number shown in the completed journey,
demonstrate a provenance/evidence path or explicitly mark it as a
currently unsupported/assumed value.

EXECUTION PROMPT

# Appendix A — Copy/paste Claude implementation prompt

Use the following prompt as the next autonomous build instruction. It
intentionally prioritises the first complete user journey over backend
breadth.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>We have now frozen the Farm Return Next Product &amp; UX
Specification v1.1. Treat the specification as the product source of
truth. Do not invent new product concepts, redesign the navigation, or
substitute generic dashboard patterns.<br />
<br />
BRANCH / SAFETY<br />
- Work only on farm-return-next.<br />
- Do not touch main or production.<br />
- Reuse the shipped Next architecture and contracts.<br />
- Never fabricate farm data, scientific outputs, satellite values, GPS
state or database state.<br />
<br />
NORTH STAR<br />
Farm Return should feel like opening a living, explorable farm world
rather than a sterile farm-management app. The farmer primarily looks,
taps, confirms and adjusts. The system observes, estimates, prompts,
explains and learns.<br />
<br />
The canonical loop is:<br />
Observe → Estimate → Prompt → Decide → Act → Confirm → Actual →
Learn<br />
<br />
PRIMARY NAVIGATION<br />
Today / Farm / Plan / Records<br />
<br />
GLOBAL ASK AI<br />
Ask AI must be accessible from every primary screen. It must receive
only explicit current context that is technically available: farm,
field, animal/group, Prompt, job, record, satellite observation or
planning context. Fail closed if context is missing. Do not invent
farm-specific facts. Keep Ask AI contextual so the user does not lose
their place.<br />
<br />
VISUAL DIRECTION<br />
- Light, calm, premium agricultural interface.<br />
- Warm off-white / light neutral surfaces and restrained farm
greens.<br />
- World/map imagery as a primary interaction surface where
appropriate.<br />
- Contextual cards and overlays rather than dense KPI dashboards.<br />
- Serif/display headings may be paired with a clean sans-serif
functional layer.<br />
- Use amber only for attention / needs-confirmation and red/orange for
genuine restrictions.<br />
- Minimal visual clutter and progressive disclosure.<br />
- The farm is primary; UI chrome is secondary.<br />
<br />
INTERACTION TAXONOMY<br />
Prompt = a real decision/action the farmer can meaningfully
accept/plan/edit/dismiss/inspect.<br />
Notification = lifecycle/event information derived from real
state.<br />
Gate/Constraint = a restriction or eligibility condition; explain what
is restricted, why, and what remains permitted. Do not force a Gate into
Prompt semantics.<br />
Observation = real evidence such as GPS, telemetry, satellite variation,
weather, farmer note/photo/voice or other trusted source.<br />
<br />
EFFORTLESS DATA CAPTURE<br />
Prefer infer → pre-fill → confirm/correct over manual forms. Use GPS,
weather, plans, previous estimates, telemetry and other trusted data
only when real. Preserve provenance and the distinction between Estimate
and Actual.<br />
<br />
PHASE 0 — DEV DATABASE VALIDATION<br />
1. If real Dev DB access is available, run
supabase/validation/decisions_jobs_rls_validation.sql.<br />
2. Only if it genuinely passes, promote the relevant migrations from
APPLIED_DEV to VALIDATED_DEV.<br />
3. Apply the newer telemetry, telemetry-retention and notifications
migrations to Dev if not already applied, then verify real database
state.<br />
4. If DB access is not available, record the blocker clearly and
continue only with work that does not require inventing DB state.<br />
<br />
PHASE 1 — CANONICAL VISUAL PATTERNS<br />
Document and implement only the reusable Farm Return tokens/patterns
required for this build: typography hierarchy, light surfaces, primary
green, Ready / Active / Attention / Constraint states, cards, buttons,
map markers, bottom navigation, Prompt, Notification, Gate/Constraint,
Ask AI, and loading/empty/error/offline states. Do not build a generic
design-system project.<br />
<br />
PHASE 2 — TODAY / LIVING FARM WORLD<br />
Build Today around the question “What matters on my farm right
now?”<br />
- Make the farm/world the primary visual object where real map data
allows.<br />
- Surface only real ready work, active jobs, jobs needing confirmation
and genuine Prompts.<br />
- Use one strongest “What matters now” action rather than an inbox of
cards.<br />
- Use location-aware context only where real GPS permissions/data
support it.<br />
- Weather remains ambient unless it materially drives a real
action.<br />
<br />
PHASE 3 — FARM / FIELD EXPLORATION<br />
Implement Farm → Field → Current state → Intelligence → Activity →
Suggested action.<br />
- A selected field should surface only relevant real information such as
status, soil, recent activity, planned work, constraints and satellite
availability.<br />
- Use progressive disclosure rather than module-heavy dashboards.<br />
- A Gate such as p-build-up eligibility remains a Constraint, not a
Prompt.<br />
<br />
PHASE 4 — COMPLETE ONE REAL FARM RETURN LOOP<br />
Choose one already-shipped genuine Prompt that cleanly supports a
physical farm job. Implement:<br />
real Prompt → farmer accepts/plans → Activity/Job created → GPS Job Mode
→ job completes → Completed—estimated → farmer confirms/edits Actual →
Completed—actual record.<br />
<br />
GPS Job Mode:<br />
- feels like entering an active task, not filling a form;<br />
- shows field/job context and real tracking state;<br />
- minimises controls;<br />
- never fabricates coverage, rate, GPS or sensor values;<br />
- distinguishes planned/target values from measured/derived
values.<br />
<br />
Confirm Actual:<br />
- show Estimated and proposed Actual side by side;<br />
- pre-fill only from real evidence;<br />
- make correction easy;<br />
- save the Estimate/Actual difference and provenance for learning.<br />
<br />
PHASE 5 — PLAN<br />
Build Day / Week / Month with emphasis on Today / Tomorrow / This week.
Separate planned work from genuine opportunities/prompts. Do not
implement a generic calendar-first screen.<br />
<br />
PHASE 6 — RECORDS<br />
Build a readable activity timeline rather than a spreadsheet register.
Show activity, field/group, date/time, core quantity, provenance, and
estimated/confirmed state. Opening a record should reveal connected
context and Estimate vs Actual.<br />
<br />
PHASE 7 — ASK AI<br />
Wire contextual Ask AI into all implemented primary screens. Explicitly
test that it gets the correct current context and fails closed when
context is missing.<br />
<br />
PHASE 8 — LIVESTOCK + BREEDING &amp; BIRTHS<br />
Do not build a cattle-only pregnancy feature. Use one species-aware
Breeding &amp; Births model.<br />
Initial product scope: cattle, sheep and horses.<br />
- Cattle: target calving window; bull exposure / AI; pregnancy scan/vet
evidence; expected calving; actual calving.<br />
- Sheep: target lambing period; ram in/out; group/batch management;
pregnancy scan including litter-size evidence where recorded; expected
lambing; actual lambing.<br />
- Horses: individual mare; cover/AI; reproductive/vet scans; expected
foaling; actual foaling.<br />
<br />
Allow the farmer to start from a desired birth window and work backwards
to an estimated breeding window using authoritative species/domain
logic. Do not hard-code a single gestation number in the UI. Refine
expected birth windows as stronger evidence arrives; preserve confidence
and provenance.<br />
<br />
PHASE 9 — SATELLITE / VEGETATION INTELLIGENCE<br />
The early product boundary is relative vegetation intelligence, not
biomass estimation.<br />
Allowed:<br />
- real latest usable Sentinel-2 scene;<br />
- relative Lower / Typical / Higher vegetation zones;<br />
- stronger/weaker areas within a field;<br />
- historical comparison and change between valid scenes;<br />
- persistent anomaly worth inspecting;<br />
- approximate affected area where scientifically defensible;<br />
- Inspect area / Log observation workflow.<br />
<br />
Not allowed at this stage:<br />
- exact kg DM/ha;<br />
- tonnes DM;<br />
- exact grass-growth rate;<br />
- yield/feed-wedge claims;<br />
- causal agronomic diagnosis without validated evidence.<br />
<br />
Show cloud/unusable scenes honestly. A satellite observation should be
able to lead to a ground inspection and farmer observation, creating a
useful evidence loop.<br />
<br />
PHASE 10 — SCIENTIFIC DETAIL / INPUT PLANNING / CONSTRAINTS<br />
Reuse the approved light visual patterns for soil/scientific detail,
Input Planning and Gate/Constraint views. Preserve source, date,
confidence and Estimate/Actual distinctions. Input Planning should
forecast quantities/timing from real connected farm data and surface
bulk-buy opportunities without corrupting agronomic
recommendations.<br />
<br />
QUALITY GATE FOR EVERY PHASE<br />
- inspect existing architecture first;<br />
- reuse shipped domain logic/contracts;<br />
- no invented data or placeholder scientific outputs;<br />
- test real state transitions;<br />
- handle loading/empty/error/offline/permission states;<br />
- audit mobile layout and accessibility;<br />
- run repo typecheck/lint/tests/build;<br />
- perform a critical audit, fix findings, then commit clean work;<br />
- keep an implementation log and explicit blockers.<br />
<br />
STOP CONDITION<br />
Do not optimise for maximum code volume. The priority is the first
genuinely usable Farm Return Next experience. Once the complete Prompt →
Job → GPS → Actual → Record → contextual Ask AI journey is working
cleanly and audited, stop and report exactly what is complete, what
remains blocked, and which canonical screen should be built next.<br />
<br />
SYSTEM-WIDE SCIENTIFIC / FINANCIAL RULES<br />
- No material derived value is complete without a Calculation &amp;
Evidence Ledger entry: calculation/model ID and version, input values
and units, evidence classification, source and source date/version,
method/formula/lookup path, result and unit, confidence, Estimate/Actual
state and timestamp.<br />
- Preserve historical reproducibility. New source/model versions must
not retroactively change old results.<br />
- Ask AI may explain calculations or request scenario changes, but
validated engines perform the calculations. Never use LLM-generated
agronomic/financial arithmetic as a substitute for the engine.<br />
- Scientific/regulatory source changes require review/test/release;
live/reference data may refresh under versioned ingestion rules.<br />
- Architect for expert-reviewed model releases and generated Calculation
&amp; Evidence Reports.<br />
<br />
FINANCIAL INTELLIGENCE REQUIREMENT<br />
Financials are a connected product layer, not a later spreadsheet. Track
Estimate vs Actual costs/revenues, price provenance,
enterprise/whole-farm views, cash-flow/scenario effects and links from
operational decisions. A supplier quote or invoice may replace a
benchmark only with explicit provenance/confirmation.<br />
<br />
FEED &amp; FINISH REQUIREMENT<br />
Feed &amp; Finish is a first-class decision engine. It must eventually
support: animals/group state; housing/target date or weight; feed
inventory and quality; required performance; scientifically supported
feed requirement; total tonnes/bales; reserve/deficit; cost; realistic
scenario comparison; and Estimate vs Actual learning. Breed/type is an
optional refinement hook, not a blocking V1 input; do not introduce
breed modifiers until evidence is validated. If the target is not
scientifically supportable, fail closed.<br />
<br />
TRUSTED DATA UPDATE LAYER<br />
Use a Source Registry and classify sources as live/operational,
reference/market, or scientific/regulatory. Live/reference sources may
update through validated, timestamped/versioned ingestion.
Scientific/regulatory logic may only change through detected source
update → review → test → approval → new model release. Preserve
offline-first farm workflows.<br />
<br />
REQUEST QUOTE / PROCUREMENT<br />
The early purchasing model is Request Quote, not a Farm Return checkout
or direct group-buy marketplace. A farmer reviews a need calculated by
Input Planning/Feed &amp; Finish and explicitly requests a quote.
Approved suppliers quote the farmer directly. Farmer and supplier
transact/pay directly; Farm Return does not initially hold customer
funds. Aggregated anonymised demand may support supplier
pricing/economies of scale. Farm Return may earn a supplier-funded
referral/commission fee. In-app payments are deferred.<br />
<br />
PHASE 11 — SCIENTIFIC VALIDATION / EVIDENCE LEDGER<br />
Define calculation IDs/versioning, evidence classes, source registry
contract, model validation states, reproducibility rules and generated
report structure. Do not claim expert validation until a real reviewer
has approved a model version.<br />
<br />
PHASE 12 — FINANCIAL INTELLIGENCE<br />
Implement or formalise the connected financial model only from
existing/validated domain data. Every material price/cost/revenue must
carry provenance and date.<br />
<br />
PHASE 13 — FEED &amp; FINISH EXEMPLAR<br />
Build only after the calculation/evidence framework is ready. Prefer one
deeply validated Irish cattle use case over shallow cross-species
estimates. Support future species and breed/type refinement
architecturally without inventing coefficients.<br />
<br />
PHASE 14 — TRUSTED SOURCE INGESTION<br />
Implement the controlled data-update layer and source-change review
workflow for approved sources; never let the open internet silently
rewrite calculations.<br />
<br />
PHASE 15 — REQUEST QUOTE<br />
Connect a calculated input/feed need to a consent-based supplier quote
request. Keep Farm Return out of the payment flow initially and preserve
quote → purchase Actual provenance.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

DECISION REGISTER

# Appendix B — Product decisions frozen in v1.1

| **Decision**            | **Frozen position**                                                                                                                    |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Visual tone             | Light, calm, premium, world-first; current light mock-ups are canonical inspiration.                                                   |
| Navigation              | Today / Farm / Plan / Records.                                                                                                         |
| AI                      | Ask AI accessible on every primary screen; contextual and fail-closed.                                                                 |
| Data entry              | Infer / pre-fill / confirm where possible; manual entry is fallback, not default.                                                      |
| Prompt taxonomy         | Prompt, Notification and Gate/Constraint remain separate.                                                                              |
| P build-up eligibility  | Gate/Constraint; not a fifth Prompt unless product framing is explicitly revisited.                                                    |
| Satellite early feature | Relative vegetation / underperforming zones / history / change / ground inspection.                                                    |
| Satellite later feature | Calibrated biomass / DM per ha only after scientific validation and ground-truth strategy.                                             |
| Livestock breeding      | Species-aware Breeding & Births supporting cattle, sheep and horses from the product model.                                            |
| First build milestone   | Real Prompt → Job → GPS mode → Confirm Actual → Record → contextual Ask AI.                                                            |
| Scientific evidence     | Every material derived value must be traceable and exportable through a Calculation & Evidence Ledger / report.                        |
| Expert review           | Models are validated/versioned at engine level; no claim of expert validation before genuine review.                                   |
| Financials              | Connected whole-farm/enterprise Estimate → Actual intelligence with explicit price provenance.                                         |
| Feed & Finish           | First-class planning engine linking livestock targets, feed inventory/quality, scenarios, cost and Actual outcomes.                    |
| Breed/type              | Optional fine-tuning hook now; introduce modifiers only from validated evidence.                                                       |
| Internet/data updates   | Trusted Source Registry + versioned ingestion; scientific/regulatory changes require reviewed releases.                                |
| Purchasing              | Request Quote from calculated need; farmer transacts directly with supplier; supplier-funded fee/commission model preferred initially. |
| Payments                | Farm Return does not initially hold farmer funds; in-app payment may be introduced later.                                              |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>What should not be discussed again before
implementation</strong></p>
<p>The overall app concept, primary navigation, core loop, light visual
direction, global Ask AI requirement, early satellite boundary,
Prompt/Notification/Gate distinction, and the need for species-aware
Breeding &amp; Births are sufficiently settled for the next build
phase.</p>
<p>Also frozen at architecture/product level: evidence-ledger
requirement, expert-reviewed model release process, financial/feed
integration, trusted source-update governance, breed/type as a future
validated refinement, and Request Quote with supplier-direct payment in
the initial commercial model.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>
