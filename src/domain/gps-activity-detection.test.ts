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

    // A real case where confidence genuinely is "high": several close-
    // together fixes (0-7s) build up sample count and ratio well past
    // double the minimum, then a real gap to t=400s pushes dwell time
    // itself past double the minimum too, all at once — every "strong"
    // criterion is genuinely satisfied the moment this fires, not
    // asserted from a thin margin.
    const closeTogether = Array.from({ length: 8 }, (_, i) => sample(i, HOME_CENTRE));
    const strong = runStart([...closeTogether, sample(400, HOME_CENTRE)]);
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
    // evidence — the fix is not a permanent block on ever finishing.
    for (const t of [540, 600, 660]) {
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
