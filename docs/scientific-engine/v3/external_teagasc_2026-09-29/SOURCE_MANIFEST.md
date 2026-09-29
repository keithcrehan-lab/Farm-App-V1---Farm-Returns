# Campaign C — external Teagasc evidence snapshot

Retrieved: 2026-09-29T20:40:17Z

These files are frozen source snapshots captured for Campaign C evidence ingestion.

They are source evidence, not Farm Return conclusions.

## Sources

### TGC-OM-2026
Title: Organic Manures
Organisation: Teagasc
URL: https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/organic-manures/
Local: raw/organic-manures.html
Relevant claims:
- low-index organic P availability
- low-index organic K availability
- 50% crop P requirement organic-share guidance
- 75% crop K requirement organic-share guidance

### TGC-K90
Title: Correct fertiliser application rates and cutting dates for first-cut silage
Organisation: Teagasc
URL: https://teagasc.ie/news--events/daily/correct-fertiliser-application-rates-and-cutting-dates-for-first-cut-silage/
Local: raw/first-cut-max-k.html
Relevant claims:
- luxury K uptake above 90 kg/ha
- only 90 kg/ha should be applied in spring where more is advised
- remainder to aftermath or late autumn

### TGC-SLURRY-TIMING
Title: Getting the Most from your Slurry
Organisation: Teagasc
URL: https://teagasc.ie/environment/climate-change--air-quality/signpost-programme/current-technologies/getting-the-most-from-your-slurry/
Local: raw/slurry-timing.html
Relevant claims:
- February to April identified as the example high-efficiency slurry timing window

### TGC-YIELD-SCALE
Title: Don't delay! Fertilise silage swards today
Organisation: Teagasc
URL: https://teagasc.ie/news--events/daily/dont-delay-fertilise-silage-swards-today/
Local: raw/silage-yield-scaling.html
Relevant claims:
- 25 kg N
- 4 kg P
- 25 kg K
per tonne DM change in supported first-cut yield advice

### TGC-RATE-PRINCIPLE
Title: In-crop slurry application to cereal crops - timely tips
Organisation: Teagasc
URL: https://teagasc.ie/news--events/daily/in-crop-slurry-application-to-cereal-crops---timely-tips/
Local: raw/rate-selection-principle.html
Relevant claims:
- determine slurry nutrient content
- choose application rate to match crop nutrient allowance/requirement
- account for slurry nutrient contribution before chemical fertiliser

## Important boundary

These snapshots may support SOURCE_DIRECT principles.

They do NOT automatically prove Farm Return-specific algorithms.

In particular:

- `AI_PROVISIONAL_RATE_SELECTOR_V1` remains AI_PROVISIONAL unless the exact algorithm itself is directly evidenced.
- "February to April" does not automatically prove an externally stated exact timestamp of 1 February 00:00 through 30 April 23:59.
- the relationship between the 90 kg K guidance and Farm Return's nutrient-credit/application architecture must remain explicitly distinguished.

## SHA-256 fingerprints

- `first-cut-max-k.html`: `d35c60ae2133cdb99b2dac88f9e6d44bc26ac877b8a1e7dfab647ada6e2e8c40`
- `organic-manures.html`: `4235cee5f44321e763bae91b99ab38e4148d409f7b3beb5eb5e8393cb266522f`
- `rate-selection-principle.html`: `81bee9331df020b5db2acf26e2abebc0d28db686aeec10898dcb0b4a9b7457aa`
- `silage-yield-scaling.html`: `83a6382adac86640299add586a52c6da99ddf3e9d961b204d6c0d35c265be27f`
- `slurry-timing.html`: `3322ff9cd5c29c85f2812c3ef61f848648ccd7626be57534630c340c2c2dcc98`
