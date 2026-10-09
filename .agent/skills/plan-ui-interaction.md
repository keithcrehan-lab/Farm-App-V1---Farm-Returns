# Skill — Plan UI & Interaction

Load this skill when a Plan phase changes farmer-facing Plan or Calendar UI.

## Visual source of truth

Use the approved Farm Return visual language already established in the current app. Do not drift into generic SaaS/card-grid styling.

Plan should feel like a live agricultural operating surface: calm, information-dense, direct and quietly intelligent.

## Interaction principles

- One clear primary action per actionable job.
- The to-do row/card is the first step in doing the work, not merely a notification.
- Use progressive disclosure: glance -> understand -> verify.
- Show only decision-relevant information at glance level: task, target such as field/group, timing/window/state and concise progress where meaningful.
- Put deeper economics, evidence and provenance behind tap/expand.
- Avoid repeating the same priority or warning in multiple visual forms.

## Farmer ordering

Support direct drag/drop reordering where the phase authorises it.
- Preserve farmer working order separately from system priority.
- Give clear pickup/drop feedback.
- Motion should be restrained and functional.
- If system priority materially changes, do not silently reorder normal work. Use a one-time subtle nudge/motion plus state/colour/typographic emphasis to communicate the change while preserving farmer order.
- Critical verified legal/welfare/hard-constraint changes may surface more strongly under the domain contract.

## Microinteraction quality

Microinteractions should communicate state change, not decorate.
Examples:
- subtle movement/nudge when a job's system priority changes;
- restrained completion acknowledgement;
- smooth progress update after canonical data is saved;
- clear drag pickup/drop state;
- blocker becoming Ready should visibly but calmly transition.

Respect reduced-motion preferences.
Do not rely on motion alone; state changes must also be communicated visually/textually.

## Queue structure

Operational Plan favours task-first sections such as:
- Do next,
- Flexible today,
- Later this week,
- Waiting.

Do not force every item into a chronological calendar layout.
Shared blockers should collapse repeated warnings where possible.

## Strategic Calendar

Calendar/Future is a separate view over the same underlying planning data, not a second planning engine.
It may expose lanes/layers such as Farm work, Conditions/Weather, Regulation and relevant Events/Learning, but relevance filtering is mandatory.

## Design grammar

- A container must earn its border.
- Prefer canvas, alignment, rules, whitespace and typography over nested cards.
- Green represents Farm Return; contextual colours represent farm information/state.
- Serif is for major identity/display moments; sans for operational content.
- Avoid pill overuse and excessive rounded cards.
- Dense information is acceptable; dense chrome is not.
- Object/action context should remain clear.

## Accessibility and trust

- Keyboard-accessible reordering must exist alongside drag/drop where practical.
- Do not encode critical meaning by colour alone.
- Do not show invented precision.
- Inferred preferences should look like suggestions, not confirmed facts.
