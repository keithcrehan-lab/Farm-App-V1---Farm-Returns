# App Store / Play Store location compliance checklist

Native Mobile / Background GPS Feasibility Phase, 2026-09-04. A
checklist, not a guarantee — **store approval is never guaranteed by
satisfying a checklist**; both platforms' own review teams make a
case-by-case judgement, and both have historically rejected apps for
background-location justification they found insufficient even when
every listed technical requirement was met.

## Apple App Store

- [ ] `NSLocationWhenInUseUsageDescription` — real, farmer-facing
      language (see `LOCATION_PERMISSION_MODEL.md` §2 for a draft).
- [ ] `NSLocationAlwaysAndWhenInUseUsageDescription` — required only if
      shipping the background-service path; must specifically explain
      the background use case, not reuse the When-In-Use string
      verbatim (Apple's own review guidance flags generic/duplicated
      strings).
- [ ] `UIBackgroundModes: [location]` capability enabled in the real
      Xcode project (requires a paid Apple Developer Program
      membership — `BLOCKED_HUMAN`, not available this session).
- [ ] App Store Connect **Privacy Nutrition Label** — location data
      collection must be declared (category: "Location", linked to user
      identity since it is tied to a farm/account, used for "App
      Functionality" — real, honest categories; do not under-declare).
- [ ] A real, published, reachable **privacy policy URL** naming
      location collection, retention, and the farmer's own deletion/
      export rights (see "Account deletion/export" below) — required
      for App Store Connect submission regardless of category.
- [ ] App Review demo material: Apple's own review team frequently
      cannot exercise a genuine background-location flow themselves
      (they do not walk around with a review device) — a **demo video or
      detailed written walkthrough showing Start Job → lock the
      screen → continued tracking → Finish Job** is commonly requested
      or pre-emptively worth including in the review notes.
- [ ] If the app requests `Always` (background) location: Apple's
      guidelines require the core feature be **genuinely impossible**
      without background location — Farm Return's own real answer
      ("a job's GPS trace would have large gaps every time the farmer's
      screen locks or they check another app mid-job") is a real,
      defensible justification, but must be stated plainly in the
      review notes, not left for the reviewer to infer.

## Google Play Store

- [ ] **Background Location declaration form** (Play Console → App
      content → Sensitive app permissions) — a real, separate
      questionnaire required whenever `ACCESS_BACKGROUND_LOCATION` is
      requested, asking for the specific feature, why foreground-only
      location is insufficient, and a demo video. Google's own policy
      explicitly lists "not clearly benefiting the user" apps as a
      rejection reason — the same "genuinely impossible without
      background" bar Apple applies.
- [ ] **Data Safety section** (Play Console) — location data collection,
      sharing (none, if true), and deletion must be declared accurately;
      mismatches between the declared behaviour and the app's real
      behaviour are a real, enforced policy violation (not just a
      cosmetic listing issue).
- [ ] `android:foregroundServiceType="location"` declared in the
      manifest, plus a real, user-visible notification while the service
      runs (already required by the OS itself, see
      `LOCATION_PERMISSION_MODEL.md` §3 — Play's own review also checks
      for this).
- [ ] `POST_NOTIFICATIONS` permission handled — required on Android 13+
      for the foreground-service notification itself to display at all.
- [ ] A real, published, reachable privacy policy URL — same requirement
      as Apple, and also a formal Play Console submission field.
- [ ] Target API level compliance — Play requires apps target a recent
      Android API level (raised annually); the real generated project
      this phase built already targets Android SDK Platform 36 (the
      Capacitor CLI's own current default, confirmed by this session's
      real Gradle build).

## Both platforms — account/data implications

- [ ] **Account deletion**: if a farmer deletes their Farm Return
      account, does location history (raw GPS observations,
      `telemetry_events`) get deleted too? This is a real, disclosed
      product-policy question this phase does not answer — the existing
      web app's own account-deletion flow (if one exists) should be
      checked/extended to cover this same data, not treated as a
      mobile-only concern.
- [ ] **Data export**: does a farmer have a way to export their own
      recorded GPS history? Same open question as above — a real GDPR/
      general-privacy-practice expectation in most markets, not
      store-specific, but both stores' own privacy questionnaires ask
      about it directly.
- [ ] **Screenshots/demo evidence for review**: both stores' review
      teams commonly request or benefit from a short screen recording of
      the real Start Job → background → Finish Job flow — plan to
      produce one from a real device test
      (`PHYSICAL_DEVICE_TEST_PLAN.md`) before submission, not
      improvised at review time.

## What this checklist does not claim

This is a starting checklist derived from each platform's own current,
publicly documented policy as of this phase — not legal advice, not a
substitute for reading each platform's own current developer policy in
full before submission, and not a guarantee either store approves this
app. Store policy changes; re-verify against each platform's own current
documentation at actual submission time, the same "public guidance
changes, do not encode it as a permanent constant" discipline this
repo's own `CLAUDE.md` already applies to scientific/regulatory sources.
