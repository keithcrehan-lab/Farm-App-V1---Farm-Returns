# Farmer Pilot

Durable plan for the first farmer pilot. Current status is in `STATE.md`; findings go in `FEEDBACK.md`.

- **Build:** the validated pilot build, `farm-return-pilot-v1`. That tag points at `c40bf99`; the implementation is
  `5e35def`. See `../pilot-integration/STATE.md`.

## Objective

Validate whether real Irish farmers understand Farm Return, trust it, and find it useful enough to keep using. This
is a product-validation programme, not a feature-development programme.

## Pilot size

Initial cohort: **3–5 farmers.** Prefer farmers who broadly match the current working product:
- grassland or livestock farms with cattle;
- real field, soil and nutrient decisions;
- slurry and compliance matter to them;
- comfortable enough on a phone or computer to test software.

## Core questions

1. Can a farmer understand Farm Return without the founder explaining every screen?
2. Does the Farm/map structure make sense?
3. Does What Matters tell them something useful?
4. Do they trust the recommendations and evidence?
5. Can they move naturally from farm state → issue/opportunity → action → record?
6. Do they understand the cattle experience?
7. Would they actually record weights or farm activity in Farm Return?
8. Which sections do they use without prompting?
9. Where do they hesitate, get confused or stop?
10. What problem do they believe Farm Return solves for them?
11. Would they want to use it again?
12. Would they eventually pay for it, and what would make it worth paying for? (This is not formal pricing research.)

## Pilot scope

**In scope:** these validated areas:
- Farm, Fields and Soil;
- nutrient and fertiliser planning;
- What Matters;
- slurry and compliance;
- Cattle, Manage herd and Record Weight;
- Records and evidence;
- Supports;
- weather;
- the existing market and quote functions, where relevant.

**Not part of the pilot promise** (don't imply these are available): AI assistant, full Finance, silage planning, feed
optimiser, cattle marketplace, advanced live mart integration, cattle photos, an app-store mobile version.

## Known non-blocking limitations

These were known before the pilot. They are logged in `FEEDBACK.md` as KNOWN PRE-PILOT and are not automatic
development tasks:
1. **Price sources:** What Matters and Market Prices / the Fertiliser Plan use different CSO price evidence paths.
2. **Manage herd live weight:** the Total Cattle figure is based on group-level information. It may say "Live weight
   not recorded" even when an individual animal has a recorded weight.
3. **Plan:** shows some closed-period notices under "Genuine opportunities".
4. **Records:** still has a technical "Inputs" line with some raw codes.
5. **Dev farm data:** the development farm contains QA/test rows.

## Philosophy

**OBSERVE FIRST. FIX SECOND.** Don't implement every suggestion straight away. One farmer's preference is not
automatically a product requirement. Look for:
- repeated friction;
- blocked core journeys;
- loss of trust;
- wrong or misleading information;
- high-value repeated requests.

## Session script (about 30–45 minutes)

Don't give a product tutorial first. Observe; don't correct straight away.

### A. Introduction

Say something like: "Farm Return is designed to help you understand what's happening on the farm, what needs
attention and what actions could improve the return from the farm. I'd like you to use it as naturally as possible.
I'm testing the product, not you. If something is confusing, that's useful for me to see."

### B. First impression

Open Farm Return and ask: "What do you think this is showing you?" Observe:
- where they look first;
- whether the map and navigation make sense;
- what they think the product is for.

### C. Farm and field task

Ask: "Show me one of your fields and tell me what Farm Return says about it." Observe whether they can:
- find or select a field;
- understand the soil information;
- find the nutrient information;
- understand the recommendations.

### D. What Matters

Ask: "If you opened this in the morning and wanted to know what deserved your attention, where would you go?" Don't
point to What Matters. If they find it, ask: "What do you think Farm Return is telling you here?" Observe:
- whether they understand it;
- whether they trust it and find it useful;
- whether the evidence and reasoning matter to them.

### E. Cattle

Ask: "Show me your cattle." Then ask: "Pick an animal and tell me what you can learn about it." Where appropriate,
ask them to:
- look at the weight history;
- read the performance;
- consider recording a weight.

Only ask for a real, permanent weight entry if it suits that farm and session.

### F. Slurry and farm action

Ask: "If you were thinking about spreading slurry, where would you look?" Observe whether the flow makes sense.

### G. Records

Ask: "If you wanted to see what had already happened on the farm, where would you go?" Observe whether Records and
the evidence are understandable.

### H. End-of-session questions

1. What do you think Farm Return is mainly useful for?
2. What was the most useful part?
3. What was confusing?
4. Was there anything you expected to find but couldn't?
5. Is there anything here you wouldn't trust?
6. What would make you open this again next week?
7. What do you currently use instead of this?
8. If Farm Return disappeared tomorrow, would you care?
9. Who do you think this is most useful for?
10. Would you use this on your own farm?
11. If this became something you relied on, would you expect it to be free, paid, or part of another service? Ask
    this last, only after they've used the product, and don't lead them toward a price.

## What to record in each session

Record these in `FEEDBACK.md`, one row per finding:
- actions completed without help, with one hint, or only with an explanation, and tasks they failed;
- navigation mistakes;
- statements showing misunderstanding, trust or distrust;
- positive reactions;
- spontaneous requests;
- sections they ignore or return to.

Also record:
- **Time to first value:** how long until the farmer first meets something they consider useful.
- **Would use again:** YES / MAYBE / NO.

No analytics infrastructure is needed yet.

## Prioritisation (after at least 3 sessions)

| Class | Meaning | Rule |
|---|---|---|
| P0 Pilot blocker | Wrong information, data loss or a security issue, or a core journey can't be completed | Can be fixed straight away |
| P1 High-value friction | A repeated problem that materially stops farmers getting value | Prefer evidence from at least 2 farmers, unless obviously severe |
| P2 Improvement | Useful, but the product remains usable | Don't build during the initial pilot unless separately authorised |
| P3 Request / idea | Interesting, not yet validated | Don't build during the initial pilot unless separately authorised |

## Success (directional, not statistical)

The initial pilot is encouraging if most farmers:
- understand the basic purpose;
- can get around Farm, Fields and Cattle without constant guidance;
- understand What Matters;
- find at least one genuinely useful insight or workflow;
- trust the evidence enough to act on it or investigate;
- can see a reason to come back;
- hit no repeated blocking defects.

Also identify the strongest repeated reason a farmer would **not** use it.
