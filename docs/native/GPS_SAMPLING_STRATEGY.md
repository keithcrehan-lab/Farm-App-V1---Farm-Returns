# GPS sampling / battery strategy — native Active Job Tracking

Native Mobile / Background GPS Feasibility Phase, 2026-09-04. Governs
`NativeLocationTrackingProvider`'s own background-service configuration
(`apps/mobile-spike/src/native/NativeLocationTrackingProvider.ts`) —
never the web adapter, which already samples at whatever rate
`navigator.geolocation.watchPosition`'s own OS-level throttling permits
and is out of this document's scope. Every number below is an
operational/UX judgement call, not a scientific or regulatory constant —
this document is not an evidence-register entry, and none of these
figures should ever be presented to a farmer as a Farm Return finding.

## 1. Real constraint this document does not solve

**No agronomic meaning is ever inferred from GPS sampling frequency,
gaps, or dwell time** — `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §8's own
rule ("a phone being inside a field proves only that: the phone was
there, for some duration, at some recorded positions") governs
everything below. Nothing in this document changes what a GPS trace is
allowed to *mean* — only how densely/frequently it is captured and how
aggressively the device conserves battery while capturing it.

## 2. Movement-context profiles

Real-world Active Job Tracking sessions fall into a few genuinely
distinct movement patterns, each warranting a different sampling
posture — not one fixed rate for every job:

| Context | Typical speed | Sampling posture |
|---|---|---|
| Tractor/machine work (spreading, silage) | 5–25 km/h, sustained | `distanceFilter: 8–10m`, no fixed time interval — the plugin already used (`@capacitor-community/background-geolocation`) samples on real movement, not a timer, so a stationary tractor (e.g. a headland turn, a full spreader waiting to refill) naturally produces no extra fixes |
| Walking / field inspection | 1–5 km/h | `distanceFilter: 3–5m` — a tighter filter than machine work, since a farmer's own walking route through a field is a real, useful trace at a finer grain, and the absolute fix *rate* stays low regardless (walking covers less ground per unit time) |
| Stationary (parked, a paused session, a farmyard stop) | ~0 km/h | No new fixes at all once `distanceFilter` isn't cleared — this is the plugin's own real, built-in battery saving, not something this app has to detect and react to separately |

`distanceFilter` (not a fixed-interval timer) is deliberately the
primary lever — a distance-based filter naturally adapts to all three
contexts above without this app needing its own speed-detection logic
(which would itself risk inventing a "detected activity" claim this
contract's own Observed/Estimated/Actual boundary does not sanction).

## 3. Accuracy vs. battery

`NativeLocationTrackingProvider`'s own foreground path
(`@capacitor/geolocation`) uses `enableHighAccuracy: true` for Active
Tracking (matching the web adapter's own identical choice) — real GPS
chipset accuracy, not network/cell-tower-derived. The background-service
path inherits whatever accuracy the plugin's own native implementation
provides while backgrounded (iOS: reduced accuracy is possible under
certain power states — a real, disclosed platform behaviour, never
silently upgraded to "high accuracy" in the UI when the device itself
reports otherwise; `LocationPosition.accuracyMeters` always carries
whatever real figure the platform reports, verbatim).

## 4. When tracking should pause or reduce frequency

- **A farmer-initiated Pause** (`pauseJobSession`) stops Active Tracking
  outright (`ActiveJobSessionView.tsx`'s own existing effect already
  keys tracking start/stop on `session.status === "active"`) — no GPS
  capture at all while paused, not a reduced-frequency mode. This is
  already correct, unchanged behaviour this phase reuses.
- **A real interruption** (permission revoked, GPS unavailable, the OS
  stopping the background service) stops delivering fixes entirely —
  handled as a real `InterruptionGap`
  (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
  §7), never as a "reduced sampling" state that quietly continues.
- **No time-of-day or battery-level-based throttling is built this
  phase** — a real, disclosed gap, not silently assumed solved. A future
  increment could reduce `distanceFilter` sensitivity (e.g. to 15–20m)
  once a device's own OS reports a real low-battery state
  (`navigator.getBattery()`'s native-plugin equivalent), trading trace
  density for battery life during a long job — deliberately not built
  speculatively here, matching this repo's own established "no
  unconsumed interface" discipline (`NATIVE_GPS_ARCHITECTURE_DECISION.md`
  §2.3's identical reasoning for deferring
  `NotificationDeliveryProvider`).

## 5. Estimated battery impact (informational, not measured on a real device)

Continuous background GPS is a real, material battery cost on both
platforms — industry-reported ranges for a foreground-service/Core
Location background session with `enableHighAccuracy` are commonly
5–15% battery per hour of active tracking, varying heavily by device
age, GPS chipset, and concurrent radio use (cellular data for outbox
sync). **This session could not measure a real figure** — no physical
device was available (`BLOCKED_EXTERNAL`, see
`docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`) — this range is cited from
public developer reports for comparable plugins/configurations, not a
Farm Return-specific measurement, and must not be presented to a farmer
as a validated figure until a real device test produces one.
