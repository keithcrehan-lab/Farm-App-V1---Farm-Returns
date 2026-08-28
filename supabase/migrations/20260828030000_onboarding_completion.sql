-- Real Mode Completion Phase 2/3 — onboarding resumability.
--
-- The redesigned onboarding (Farm -> Livestock -> Enter Farm Return) needs
-- a real way to answer "has this farmer actually finished onboarding?"
-- that isn't just "does a farms row exist" — a farmer who creates a farm
-- and then closes the tab before adding livestock must resume at the
-- Livestock step on return, not get redirected straight into a dashboard
-- as if onboarding were done (the previous behaviour), and not be asked
-- to create a second farm (the previous /onboarding page's only other
-- branch). See docs/real-mode-completion/BUILD_LOG.md Phase 2/3.

alter table public.farms
  add column onboarding_completed_at timestamptz;
