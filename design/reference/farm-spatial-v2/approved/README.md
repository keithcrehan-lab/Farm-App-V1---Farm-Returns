# Farm Spatial V2 approved reference

`farm_return_design_system_refined.html` is the approved self-contained interactive design reference.

Production implementation rules:

- reproduce its visual hierarchy and interaction grammar;
- do **not** copy its static aerial image, mock field geometry or mock data into production;
- use Farm Return's real `MapHero`, persisted polygons and canonical domain outputs;
- inspect at both 1440×900 desktop and 390×844 mobile widths;
- the supplied PNGs are convenience anchors only; the HTML reference is authoritative for the complete flow.

Before implementation, record SHA-256 checksums for all files in this directory. Do not alter approved references inside a build task. If the reference must change, stop and create a separate design-reference task.
