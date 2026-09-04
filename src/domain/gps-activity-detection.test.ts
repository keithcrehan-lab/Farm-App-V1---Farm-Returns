import { describe, expect, it } from "vitest";
import {
  DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG,
  IDLE_GPS_ACTIVITY_START_STATE,
  advanceFinishDetection,
  advanceStartDetection,
  idleGpsActivityFinishState,
  type GpsActivityDetectionConfig,
  type GpsActivityFieldRef,
  type GpsActivitySample,
  type GpsActivityStartState,
} from "./gps-activity-detection";

// Two small, non-overlapping real-shaped squares (~220m each side),
// loosely centred on real Irish farm-scale coordinates — not any real
// farm's actual boundary, just valid closed polygons for geometry tests.
const HOME_FIELD: GpsActivityFieldRef = {
  id: "field-home",
  name: "Home Field",
  polygon: {
    type: "Polygon",
    coordinates: [
      [
        [-8.001, 53.399],
        [-7.999, 53.399],
        [-7.999, 53.401],
        [-8.001, 53.401],
        [-8.001, 53.399],
      ],
    ],
  },
};

const BACK_FIELD: GpsActivityFieldRef = {
  id: "field-back",
  name: "Back Field",
  polygon: {
    type: "Polygon",
    coordinates: [
      [
        [-7.995, 53.399],
        [-7.993, 53.399],
        [-7.993, 53.401],
        [-7.995, 53.401],
        [-7.995, 53.399],
      ],
    ],
  },
};

const FIELDS = [HOME_FIELD, BACK_FIELD];

const HOME_CENTRE = { lat: 53.4, lng: -8.0 };
const BACK_CENTRE = { lat: 53.4, lng: -7.994 };
const FAR_AWAY = { lat: 53.42, lng: -8.05 }; // ~4km away — never near either field

const T0 = new Date("2026-06-15T10:00:00.000Z").getTime();

function sample(offsetSeconds: number, point: { lat: number; lng: number }, accuracyMeters = 10): GpsActivitySample {
  return { lat: point.lat, lng: point.lng, accuracyMeters, recordedAt: new Date(T0 + offsetSeconds * 1000).toISOString() };
}

function runStart(samples: GpsActivitySample[], fields: readonly GpsActivityFieldRef[] = FIELDS, config: GpsActivityDetectionConfig = DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG): GpsActivityStartState {
  return samples.reduce((state, s) => advanceStartDetection(state, s, fields, config), IDLE_GPS_ACTIVITY_START_STATE);
}

describe("advanceStartDetection", () => {
  it("Codex audit round 2: never fires candidate_start when the current sample itself is no longer positive evidence, even if the historical ratio/dwell/count already qualify", () => {
    // Home Field established at t=60; by t=240 the historical ratio
    // (3/4 inside), dwell (180s since t=60), and sample count (4) all
    // already clear their own thresholds — but the *current* sample
    // (t=240) is genuinely far away. A version keying only off the
    // historical aggregate would wrongly present "starting work in Home
    // Field" right after the farmer has already left it.
    const sequence = [sample(0, HOME_CENTRE), sample(60, HOME_CENTRE), sample(120, HOME_CENTRE), sample(180, HOME_CENTRE), sample(240, FAR_AWAY)];
    const result = runStart(sequence);
    expect(result.status).not.toBe("candidate_start");
    expect(result.candidateFieldId).toBe("field-home");
  });

  it("Scenario A: sustained dwelling inside a real field produces a candidate_start", () => {
    // Every 60s for 4 minutes, genuinely inside Home Field.
    const samples = [0, 60, 120, 180, 240].map((t) => sample(t, HOME_CENTRE));
    const result = runStart(samples);
    expect(result.status).toBe("candidate_start");
    expect(result.candidateFieldId).toBe("field-home");
    expect(result.confidence).not.toBe("low");
  });

  it("Codex audit round 1: a long drive before arriving never counts toward dwell time in the field itself", () => {
    // A real 10-minute drive (samples far from any field, genuinely
    // accepted — good accuracy, just not near a mapped field) followed
    // by arrival at Home Field. The drive alone already exceeds the
    // 180s dwell threshold and the combined sample count already clears
    // the count threshold — a version that measured dwell from the
    // window's own first sample (rather than from when the candidate
    // field was actually entered) would wrongly fire almost immediately
    // on arrival. Only 2 samples exist since arrival, short of
    // minSamplesForCandidateStart (3) — must still be "observing".
    const drivingThenArriving = [
      sample(0, FAR_AWAY),
      sample(120, FAR_AWAY),
      sample(240, FAR_AWAY),
      sample(360, FAR_AWAY),
      sample(600, HOME_CENTRE), // just arrived
      sample(660, HOME_CENTRE), // 60s after arrival — real dwell so far
    ];
    const result = runStart(drivingThenArriving);
    expect(result.status).toBe("observing");
    expect(result.candidateFieldId).toBe("field-home");
  });

  it("Codex audit round 1: switching to a genuinely different field resets dwell time — no inherited evidence from the old field", () => {
    // A brief spell in Home Field (never enough to qualify on its own —
    // only 60s dwelling before the switch), then a genuine move to Back
    // Field. If dwell time were still measured from the whole window's
    // own first sample (t=0) rather than from when Back Field was
    // itself entered (t=180, once the switch-stability rule picks it),
    // the 180s already elapsed since t=0 would already clear the
    // threshold the instant the switch happens — this must not fire.
    const sequence = [sample(0, HOME_CENTRE), sample(60, HOME_CENTRE), sample(120, BACK_CENTRE), sample(180, BACK_CENTRE)];
    const result = runStart(sequence);
    expect(result.candidateFieldId).toBe("field-back");
    expect(result.status).toBe("observing"); // 0s dwelling in Back Field so far — just switched
  });

  it("Scenario B: a drive-past (never dwelling long enough, then expires) never creates a candidate", () => {
    // A single fast pass through the field's own boundary, then gone —
    // far short of both the sample-count and dwell-time thresholds, and
    // the config's own expiry eventually gives up rather than lingering
    // in "observing" forever.
    const samples = [
      sample(0, FAR_AWAY),
      sample(30, HOME_CENTRE, 10), // one fix inside, briefly
      sample(60, FAR_AWAY),
      sample(1000, FAR_AWAY), // long past candidateExpirySeconds with no stable field
    ];
    const result = runStart(samples);
    expect(result.status).not.toBe("candidate_start");
  });

  it("Scenario B variant: rapid movement within the field boundary never counts as genuine dwelling", () => {
    // Two points, both genuinely inside Home Field's own polygon, ~207m
    // apart — bounced between every 15s implies ~50 km/h, well above
    // maxSpeedKmhForFieldWork (15). Total elapsed time and sample count
    // both clear the dwell/count thresholds, but almost every sample
    // (all but the very first, which has no prior fix to derive a speed
    // from) is speed-disqualified, so the inside-ratio never clears
    // minInsideFieldRatioForCandidateStart — this must never be read as
    // real field work just because the clock ran long enough.
    const cornerA = { lat: 53.3992, lng: -8.0008 };
    const cornerB = { lat: 53.4008, lng: -7.9992 };
    const offsets = Array.from({ length: 17 }, (_, i) => i * 15); // 0..240s
    const bouncing = offsets.map((t, i) => sample(t, i % 2 === 0 ? cornerA : cornerB));
    const result = runStart(bouncing);
    expect(result.status).not.toBe("candidate_start");
  });

  it("Scenario C: GPS jitter near the field boundary does not destabilise field assignment", () => {
    // Genuinely working Home Field, with one noisy fix landing just
    // outside the polygon (a real GPS jitter case), surrounded by real
    // in-field fixes — the candidate field itself must stay Home Field
    // throughout (fieldSwitchStabilitySamples requires 2 consecutive
    // agreeing samples to switch; a single outlier alone can't do it).
    const samples = [
      sample(0, HOME_CENTRE),
      sample(60, HOME_CENTRE),
      sample(120, { lat: 53.4, lng: -8.0015 }), // just outside, one noisy fix
      sample(180, HOME_CENTRE),
      sample(240, HOME_CENTRE),
    ];
    const result = runStart(samples);
    expect(result.candidateFieldId).toBe("field-home");
    expect(result.status).toBe("candidate_start");
  });

  it("Scenario D: a session spanning two adjacent fields does not silently fabricate a single field beyond real evidence", () => {
    // Genuinely dwells in Home Field first (reaches its own real
    // candidate_start), independent of Back Field ever being visited.
    // Codex audit HIGH (round 1, 2026-09-04): dwell is now measured from
    // when the candidate field was itself established (the 2nd sample,
    // t=60, once the field-switch-stability rule picks it), not from the
    // window's own first sample (t=0) — a 5th sample is needed to clear
    // the real 180s dwell threshold measured from t=60.
    const homeOnly = runStart([0, 60, 120, 180, 240].map((t) => sample(t, HOME_CENTRE)));
    expect(homeOnly.candidateFieldId).toBe("field-home");
    expect(homeOnly.status).toBe("candidate_start");

    // A fresh detection window that genuinely moves from Home to Back
    // never reports Home as the candidate once enough consistent Back
    // samples have arrived — it switches, rather than sticking to a
    // stale, no-longer-true field.
    const movedToBack = runStart([
      sample(0, HOME_CENTRE),
      sample(60, HOME_CENTRE),
      sample(300, BACK_CENTRE),
      sample(360, BACK_CENTRE),
      sample(420, BACK_CENTRE),
      sample(480, BACK_CENTRE),
    ]);
    expect(movedToBack.candidateFieldId).toBe("field-back");
    // Codex audit HIGH (round 4, 2026-09-04): candidateFieldSampleCount
    // is scoped to Back Field's own real evidence (the 3 samples since
    // the switch at t=360), never the whole window's total (6) — the
    // two earlier Home Field samples never happened in Back Field.
    expect(movedToBack.observations).toHaveLength(6);
    expect(movedToBack.candidateFieldSampleCount).toBe(3);
  });

  it("rejects a sample with missing accuracy — never treated as evidence", () => {
    const samples: GpsActivitySample[] = [
      { lat: HOME_CENTRE.lat, lng: HOME_CENTRE.lng, recordedAt: new Date(T0).toISOString() }, // no accuracyMeters
      sample(60, HOME_CENTRE),
      sample(120, HOME_CENTRE),
    ];
    const result = runStart(samples);
    // Only 2 real accepted samples exist (the first was rejected) —
    // short of minSamplesForCandidateStart (3).
    expect(result.observations).toHaveLength(2);
    expect(result.status).toBe("observing");
  });

  it("Codex audit round 2: a nominally-inside fix with kilometre-scale accuracy never counts as confidently inside a small field", () => {
    // Genuinely at the field's own centre, but the reported accuracy
    // radius (5km) vastly exceeds the field's own real size — the true
    // position could honestly be anywhere within that radius, including
    // well outside the field. Must never be treated as confident
    // dwelling evidence just because the raw centre point happens to
    // land inside.
    const samples = [0, 60, 120, 180, 240].map((t) => sample(t, HOME_CENTRE, 5_000_000));
    const result = runStart(samples);
    expect(result.status).not.toBe("candidate_start");
    expect(result.candidateFieldId).toBeNull();
  });

  it("Codex audit round 11: rejects a sample whose recordedAt is not strictly after the previously accepted sample's own recordedAt", () => {
    // A real out-of-order/delayed fix (browser geolocation timestamps
    // are acquisition time, not delivery order) — t=30 arrives *after*
    // t=60 has already been accepted. If it were wrongly accepted, it
    // would backdate `candidateFieldEnteredAt` to 30, letting dwell
    // clear the 180s threshold far earlier than genuine continuous
    // evidence actually would.
    let state = runStart([sample(0, HOME_CENTRE), sample(60, HOME_CENTRE)]);
    const beforeOutOfOrder = state;
    state = advanceStartDetection(state, sample(30, HOME_CENTRE), FIELDS);
    expect(state).toBe(beforeOutOfOrder); // genuinely a no-op, same reference
    expect(state.observations).toHaveLength(2);

    // An exact-duplicate timestamp (a genuine retransmission, not
    // progress) is equally rejected — strictly greater, not
    // greater-or-equal.
    const beforeDuplicate = state;
    state = advanceStartDetection(state, sample(60, HOME_CENTRE), FIELDS);
    expect(state).toBe(beforeDuplicate);

    // Continuing with genuinely later samples behaves exactly as if the
    // out-of-order/duplicate ones never existed — dwell measured only
    // from the real entry at t=60.
    for (const t of [120, 180, 240]) state = advanceStartDetection(state, sample(t, HOME_CENTRE), FIELDS);
    expect(state.status).toBe("candidate_start");
    expect(state.candidateFieldSampleCount).toBe(4); // t=60,120,180,240 — not 5 or 6
  });

  it("rejects a sample with non-finite or non-positive accuracy", () => {
    const bad: GpsActivitySample[] = [
      { ...sample(0, HOME_CENTRE), accuracyMeters: 0 },
      { ...sample(60, HOME_CENTRE), accuracyMeters: -5 },
      { ...sample(120, HOME_CENTRE), accuracyMeters: Number.NaN },
    ];
    const result = runStart(bad);
    expect(result.observations).toHaveLength(0);
    expect(result.status).toBe("observing");
  });

  it("expires a long, genuinely ambiguous window with no stable field", () => {
    const samples = [0, 950].map((t) => sample(t, FAR_AWAY));
    const result = runStart(samples);
    expect(result.status).toBe("expired");
  });

  it("a terminal (expired) state ignores further samples", () => {
    const expired = runStart([0, 950].map((t) => sample(t, FAR_AWAY)));
    expect(expired.status).toBe("expired");
    const after = advanceStartDetection(expired, sample(1000, HOME_CENTRE), FIELDS);
    expect(after).toBe(expired); // same reference — genuinely a no-op
  });

  it("Codex audit round 9: leaving the candidate field for a stable, sustained period and later returning never combines both visits' evidence into one continuous-looking dwell", () => {
    // Isolates the field-membership-continuity fix under test from the
    // separate, already-tested speed gate (round 2's own dedicated
    // test) — the large, instant jump between the far-away test point
    // and the field on return would otherwise itself read as
    // (correctly, separately) speed-disqualified, masking whether *this*
    // fix is what's actually preventing the false candidate.
    const config: GpsActivityDetectionConfig = { ...DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG, maxSpeedKmhForFieldWork: Infinity };
    // First visit: genuine dwelling in Home Field, still short of the
    // 180s minimum on its own.
    const firstVisit = [0, 30, 60].map((t) => sample(t, HOME_CENTRE));
    // A stable, sustained departure — two consecutive samples both
    // confidently away from Home Field (meets `fieldSwitchStabilitySamples`).
    const departure = [90, 120].map((t) => sample(t, FAR_AWAY));
    // Second visit: back in Home Field, still short of 180s on its own.
    // If the two visits' evidence were wrongly combined via a still-
    // unreset `candidateFieldEnteredAt`, the elapsed time since the
    // *first* visit's own entry (t=30) plus this visit's own inside
    // samples would already clear both the dwell and ratio thresholds.
    const secondVisit = [240, 270, 300].map((t) => sample(t, HOME_CENTRE));

    const result = runStart([...firstVisit, ...departure, ...secondVisit], FIELDS, config);
    expect(result.status).not.toBe("candidate_start");

    // A later, genuinely sustained second visit (past 180s of its own
    // continuous dwelling, anchored fresh from this visit's own entry)
    // still correctly fires — the fix isn't a permanent block on this
    // field ever qualifying again.
    const restOfSecondVisit = [330, 360, 390, 420, 450].map((t) => sample(t, HOME_CENTRE));
    const full = runStart([...firstVisit, ...departure, ...secondVisit, ...restOfSecondVisit], FIELDS, config);
    expect(full.status).toBe("candidate_start");
    expect(full.candidateFieldId).toBe("field-home");
  });

  it("Codex audit round 10: two merely ambiguous (poor-accuracy, near-boundary) fixes never erase valid, still-accumulating dwell evidence", () => {
    // ~13m from Home Field's west edge — genuinely inconclusive with 50m
    // accuracy (could honestly be either side), not confidently outside.
    // Round 9's own fix compared `fieldContainingSample`'s binary answer
    // (which also returns `null` for exactly this case) against the
    // candidate field id — two of these in a row would have wrongly
    // dropped the candidate, the same "ambiguous read as departure"
    // mistake this module already fixed once for the finish detector.
    const nearBoundary = { lat: 53.4, lng: -8.0012 };
    const establishing = [0, 30].map((t) => sample(t, HOME_CENTRE));
    const ambiguousPair = [60, 90].map((t) => sample(t, nearBoundary, 50));
    const continuation = [120, 150, 180, 210].map((t) => sample(t, HOME_CENTRE));

    const result = runStart([...establishing, ...ambiguousPair, ...continuation]);
    // Fires at t=210 (dwell = 210-30 = 180, measured continuously from
    // the *original* entry at t=30) only if the ambiguous pair never
    // reset `candidateFieldEnteredAt` — a version treating them as
    // departure would have re-established the candidate no earlier than
    // t=150 (the first stable pair of real Home Field fixes after the
    // wrongly-dropped candidate), giving only 60s of dwell by t=210,
    // short of the 180s minimum.
    expect(result.status).toBe("candidate_start");
    expect(result.candidateFieldId).toBe("field-home");
  });

  it("Codex audit round 9: a real gap between accepted samples (an app interruption, not just travel) resets the dwell window even without a field switch", () => {
    // Genuine dwelling starts, but a real gap (well past
    // `maxSampleGapSecondsForContinuity`, an app interruption or signal
    // loss, not ordinary travel) interrupts it before ever qualifying.
    const beforeGap = [0, 30, 60].map((t) => sample(t, HOME_CENTRE));
    // Resumes in the *same* field after a 200s gap (> 120s) — a version
    // that only reset on a field switch would let this count as
    // continuous dwelling since t=0.
    const afterGap = [260, 290, 320].map((t) => sample(t, HOME_CENTRE));

    const result = runStart([...beforeGap, ...afterGap]);
    // Elapsed time since t=0 is 320s, already past the 180s minimum —
    // wrongly qualifying here would mean the interruption was silently
    // ignored.
    expect(result.status).not.toBe("candidate_start");

    // Genuine continuous dwelling after the gap, long enough on its own
    // (180s from the reset anchor at t=260), still correctly qualifies.
    const enough = [260, 290, 320, 350, 380, 410, 440].map((t) => sample(t, HOME_CENTRE));
    const full = runStart([...beforeGap, ...enough]);
    expect(full.status).toBe("candidate_start");
  });

  it("does not reach candidate_start with too few samples even once dwell time and ratio are satisfied", () => {
    const config: GpsActivityDetectionConfig = { ...DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG, minSamplesForCandidateStart: 10 };
    const samples = [0, 60, 120, 180, 240].map((t) => sample(t, HOME_CENTRE));
    const result = runStart(samples, FIELDS, config);
    expect(result.status).toBe("observing");
  });

  it("confidence is genuinely tiered, not fixed", () => {
    // Fires exactly at the sample that first clears the basic dwell/
    // sample/ratio thresholds (dwell measured from t=60, when the
    // candidate field was itself established, reaching the real 180s
    // minimum at t=240) — none of dwell/samples/ratio is yet double the
    // minimum at that exact moment, so this is honestly "medium", not
    // oversold as "high".
    const justEnough = runStart([0, 60, 120, 180, 240].map((t) => sample(t, HOME_CENTRE)));
    expect(justEnough.status).toBe("candidate_start");
    expect(justEnough.confidence).toBe("medium");

    // A case where confidence genuinely is "high": several close-together
    // fixes (0-7s) build up sample count and ratio well past double the
    // minimum, then a single later fix at t=400s pushes dwell time itself
    // past double the minimum too, all at once — every "strong" criterion
    // is genuinely satisfied the moment this fires, not asserted from a
    // thin margin. The single 393s jump from t=7 to t=400 deliberately
    // widens `maxSampleGapSecondsForContinuity` for this one call only
    // (real, disclosed, per-call overridability — this file's own header
    // comment) — the point under test is `computeStartConfidence`'s own
    // tiering arithmetic, not continuity-break behaviour, which
    // `maxSampleGapSecondsForContinuity`'s own tests below cover
    // directly.
    const closeTogether = Array.from({ length: 8 }, (_, i) => sample(i, HOME_CENTRE));
    const config: GpsActivityDetectionConfig = { ...DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG, maxSampleGapSecondsForContinuity: 500 };
    const strong = runStart([...closeTogether, sample(400, HOME_CENTRE)], FIELDS, config);
    expect(strong.status).toBe("candidate_start");
    expect(strong.confidence).toBe("high");
  });
});

describe("advanceFinishDetection", () => {
  it("Scenario A (finish half): sustained departure from the active field produces a candidate_finish", () => {
    let state = idleGpsActivityFinishState();
    // Confirmed working the field for a while.
    for (const t of [0, 60, 120]) {
      state = advanceFinishDetection(state, sample(t, HOME_CENTRE), "field-home", FIELDS);
    }
    expect(state.status).toBe("tracking");
    // Then genuinely leaves and stays away for the full threshold.
    for (const t of [180, 300, 420, 480]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-home", FIELDS);
    }
    expect(state.status).toBe("candidate_finish");
  });

  it("Codex audit round 2: a brisk in-field manoeuvre (fast but still genuinely inside the field) never counts as departure", () => {
    // Two points inside Home Field, ~207m apart, bounced quickly enough
    // to imply ~50 km/h — a real, if brisk, in-field turn, not a
    // departure. Speed gates the *start* detector's own "is this
    // dwelling or driving through" question; once a session is already
    // active in a known field, still being inside its boundary is
    // itself what matters, regardless of speed.
    const cornerA = { lat: 53.3992, lng: -8.0008 };
    const cornerB = { lat: 53.4008, lng: -7.9992 };
    let state = idleGpsActivityFinishState();
    state = advanceFinishDetection(state, sample(0, HOME_CENTRE), "field-home", FIELDS);
    for (const t of [15, 30, 45, 60, 300, 315, 330]) {
      state = advanceFinishDetection(state, sample(t, t % 30 === 0 ? cornerA : cornerB), "field-home", FIELDS);
    }
    expect(state.status).toBe("tracking");
  });

  it("a brief headland turn (short departure) never triggers a false finish", () => {
    let state = idleGpsActivityFinishState();
    for (const t of [0, 60]) {
      state = advanceFinishDetection(state, sample(t, HOME_CENTRE), "field-home", FIELDS);
    }
    // Briefly outside (a real headland turn), then straight back in —
    // well under minSecondsOutsideFieldForCandidateFinish (300s).
    state = advanceFinishDetection(state, sample(90, FAR_AWAY), "field-home", FIELDS);
    state = advanceFinishDetection(state, sample(120, HOME_CENTRE), "field-home", FIELDS);
    expect(state.status).toBe("tracking");
  });

  it("a terminal (candidate_finish) state ignores further samples", () => {
    let state = idleGpsActivityFinishState();
    state = advanceFinishDetection(state, sample(0, HOME_CENTRE), "field-home", FIELDS);
    for (const t of [180, 300, 420, 480]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-home", FIELDS);
    }
    expect(state.status).toBe("candidate_finish");
    const after = advanceFinishDetection(state, sample(600, HOME_CENTRE), "field-home", FIELDS);
    expect(after).toBe(state);
  });

  it("rejects a sample with unusable accuracy for finish detection too", () => {
    let state = idleGpsActivityFinishState();
    state = advanceFinishDetection(state, sample(0, HOME_CENTRE), "field-home", FIELDS);
    const before = state;
    const bad: GpsActivitySample = { ...sample(60, FAR_AWAY), accuracyMeters: -1 };
    state = advanceFinishDetection(state, bad, "field-home", FIELDS);
    expect(state).toBe(before);
  });

  it("Codex audit round 11: rejects a sample whose recordedAt is not strictly after the previously accepted sample's own recordedAt", () => {
    // A real, later "first genuine outside" fix already accepted at
    // t=300. An old, delayed fix then arrives with an *earlier*
    // timestamp (t=50) — if wrongly accepted as an even-earlier "first
    // outside" moment, it would inflate the measured departure duration
    // beyond what genuinely continuous evidence produced.
    let state = idleGpsActivityFinishState();
    state = advanceFinishDetection(state, sample(0, HOME_CENTRE), "field-home", FIELDS);
    state = advanceFinishDetection(state, sample(300, FAR_AWAY), "field-home", FIELDS);
    expect(state.status).toBe("tracking");
    const beforeOutOfOrder = state;

    state = advanceFinishDetection(state, sample(50, FAR_AWAY), "field-home", FIELDS);
    expect(state).toBe(beforeOutOfOrder); // genuinely a no-op, same reference

    // Continuing with genuinely later, continuous outside evidence still
    // correctly reaches candidate_finish, measured only from the real
    // t=300 anchor.
    for (const t of [360, 420, 480, 540, 600]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-home", FIELDS);
    }
    expect(state.status).toBe("candidate_finish");
  });

  it("Codex audit round 5: an ambiguous (poor-accuracy, near-boundary) fix is never treated as departure evidence, but a genuinely confident departure afterwards still is", () => {
    // ~13m from Home Field's west edge — genuinely outside the polygon,
    // but with 50m accuracy the true position could honestly still be
    // inside. A version that only asked "is this confidently inside?"
    // would treat every one of these the same as a confidently-outside
    // fix and could reach a false "looks like you finished" purely from
    // GPS noise, with the farmer never having actually left the field.
    const nearBoundary = { lat: 53.4, lng: -8.0012 };
    let state = idleGpsActivityFinishState();
    for (const t of [0, 60, 120]) {
      state = advanceFinishDetection(state, sample(t, HOME_CENTRE), "field-home", FIELDS);
    }
    expect(state.status).toBe("tracking");

    // A run of ambiguous fixes spanning well past both the time and
    // sample-count thresholds must never, by itself, produce a finish.
    for (const t of [180, 300, 420, 480]) {
      state = advanceFinishDetection(state, sample(t, nearBoundary, 50), "field-home", FIELDS);
    }
    expect(state.status).toBe("tracking");

    // Genuinely confident departure afterwards still works as real
    // evidence — the fix is not a permanent block on ever finishing. The
    // departure window (round 6 fix) is anchored to the *first* genuine
    // "outside" fix (t=540), not to the last confirmed-inside moment
    // (t=120) — the preceding ambiguous run must not count toward it —
    // so the full threshold duration is measured from there. Consecutive
    // fixes stay 60s apart throughout (well under
    // `maxSampleGapSecondsForContinuity`, round 9), so this is a
    // genuinely continuous run, not a large gap of its own.
    for (const t of [540, 600, 660, 720, 780, 840]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-home", FIELDS);
    }
    expect(state.status).toBe("candidate_finish");
  });

  it("Codex audit round 6: several ambiguous fixes after real outside evidence never let elapsed clock time alone trigger a finish", () => {
    // Three genuine outside fixes (already enough to satisfy the sample
    // count on their own) immediately followed by several minutes of
    // merely ambiguous fixes. A version measuring the duration from
    // "last confirmed inside" would let real clock time passing through
    // the ambiguous run alone cross the threshold, even though the
    // *current* fix is not itself outside evidence. The fix must never
    // fire while presently ambiguous, no matter how much time has
    // passed since earlier genuine outside evidence.
    const nearBoundary = { lat: 53.4, lng: -8.0012 };
    let state = idleGpsActivityFinishState();
    state = advanceFinishDetection(state, sample(0, HOME_CENTRE), "field-home", FIELDS);
    for (const t of [60, 120, 180]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-home", FIELDS);
    }
    expect(state.status).toBe("tracking");
    for (const t of [400, 500]) {
      state = advanceFinishDetection(state, sample(t, nearBoundary, 50), "field-home", FIELDS);
    }
    // Comfortably past minSecondsOutsideFieldForCandidateFinish (300s)
    // since the first genuine outside fix at t=60 — but the current fix
    // is ambiguous, not outside, so this must not fire.
    expect(state.status).toBe("tracking");
  });

  it("Codex audit round 8: a long ambiguous gap breaks continuity — sparse outside fixes bridged by ambiguity never satisfy sustained departure", () => {
    // Confirmed inside, then one early genuine outside fix.
    const nearBoundary = { lat: 53.4, lng: -8.0012 };
    let state = idleGpsActivityFinishState();
    state = advanceFinishDetection(state, sample(0, HOME_CENTRE), "field-home", FIELDS);
    state = advanceFinishDetection(state, sample(10, FAR_AWAY), "field-home", FIELDS);
    expect(state.status).toBe("tracking");

    // A long ambiguous gap — well past the duration threshold on its
    // own, but genuinely inconclusive the whole way through.
    for (const t of [100, 200, 300, 400]) {
      state = advanceFinishDetection(state, sample(t, nearBoundary, 50), "field-home", FIELDS);
    }
    expect(state.status).toBe("tracking");

    // Two more genuine outside fixes. Elapsed time since the *very
    // first* outside fix (t=10) already clears the duration threshold,
    // and three "outside"-classified samples now exist in total — a
    // version measuring from the first-ever outside evidence, ambiguous
    // gap or not, would wrongly fire here. The continuous run of real
    // outside evidence has barely begun.
    state = advanceFinishDetection(state, sample(410, FAR_AWAY), "field-home", FIELDS);
    state = advanceFinishDetection(state, sample(420, FAR_AWAY), "field-home", FIELDS);
    expect(state.status).toBe("tracking");

    // Genuinely sustained, continuous departure from here on still
    // fires — the fix isn't a permanent block on ever finishing.
    // Consecutive fixes stay 60s apart (well under
    // `maxSampleGapSecondsForContinuity`, round 9), a genuinely
    // continuous run, not a large gap of its own.
    for (const t of [480, 540, 600, 660, 720]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-home", FIELDS);
    }
    expect(state.status).toBe("candidate_finish");
  });

  it("Codex audit round 5: an active field id with no matching field entry never claims a confident finish", () => {
    // A genuine caller bug (or a field removed mid-session) must fail
    // closed — never a confident "inside" or "outside" claim without a
    // real field geometry to compare against.
    let state = idleGpsActivityFinishState();
    for (const t of [0, 60, 120, 180, 300, 420, 480]) {
      state = advanceFinishDetection(state, sample(t, FAR_AWAY), "field-unknown", FIELDS);
    }
    expect(state.status).toBe("tracking");
  });
});
