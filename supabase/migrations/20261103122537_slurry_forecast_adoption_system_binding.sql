-- Fertiliser pilot (Codex audit F010, HIGH): a SYSTEM_FORECAST adoption must
-- be bound to the livestock/store forecast the server actually calculated,
-- never to a caller-supplied label or volume.
--
-- `adoptSlurryForecastScenarioAction` recomputes the forecast server-side
-- (`buildFarmSlurryForecast`) and rejects any SYSTEM_FORECAST adoption whose
-- volume or per-store field intent does not match it. These columns record
-- that snapshot with the adoption: the forecast model version, the date it
-- was assessed from, and each store's projected volume available for a new
-- plan. The adoption's `expected_available_m3` is the server's figure.
--
-- Forward-only and non-destructive: nullable columns plus a constraint added
-- NOT VALID, so it binds every new row without rewriting or rejecting any
-- existing row. An existing SYSTEM_FORECAST row without a snapshot is never
-- treated as a system forecast by the application
-- (`currentSlurryForecastAdoption`).
alter table public.slurry_forecast_adoptions
  add column system_forecast_version text,
  add column system_forecast_assessed_on date,
  add column system_forecast_stores jsonb
    check (system_forecast_stores is null or jsonb_typeof(system_forecast_stores) = 'array');

alter table public.slurry_forecast_adoptions
  add constraint slurry_forecast_adoptions_system_forecast_bound check (
    action = 'withdraw'
    or forecast_source is distinct from 'SYSTEM_FORECAST'
    or (system_forecast_version is not null
        and system_forecast_assessed_on is not null
        and system_forecast_stores is not null)
  ) not valid;
