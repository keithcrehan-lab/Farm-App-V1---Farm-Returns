/**
 * A genuine slice of AJM09's real CSV response, captured live 2026-09-20
 * (see `cso-fertiliser-client.ts`'s header for the full verification —
 * `curl -s https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en`).
 * Not the full 2133-row response — a representative slice covering the
 * three product codes Farm Return maps (0-7-30, 18-6-12, Urea) across
 * four real months, plus a genuinely empty VALUE (Compound 10-7-23, a
 * real CSO-suppressed/missing observation, not a zero) and one
 * unmapped product code (Compound 10-5-25) to exercise
 * UNSUPPORTED_MAPPING against real, not invented, input.
 *
 * Includes the header's real leading UTF-8 BOM (U+FEFF) — a genuine
 * detail of the live response the parser must strip, not a fixture
 * artefact.
 */
export const CSO_AJM09_REAL_CSV_SAMPLE = `﻿"STATISTIC","Statistic Label","TLIST(M1)","Month","C02069V02500","Type of Fertiliser","UNIT","VALUE"
"AJM09C01","Fertiliser Price","202604","2026 April","002","Urea (46% N)","Euro per Tonne","754"
"AJM09C01","Fertiliser Price","202604","2026 April","008","Compound 0-7-30","Euro per Tonne","568"
"AJM09C01","Fertiliser Price","202604","2026 April","012","Compound 18-6-12","Euro per Tonne","644"
"AJM09C01","Fertiliser Price","202604","2026 April","020","Compound 10-5-25","Euro per Tonne","638"
"AJM09C01","Fertiliser Price","202604","2026 April","0201","Compound 10-7-23","Euro per Tonne",""
"AJM09C01","Fertiliser Price","202605","2026 May","002","Urea (46% N)","Euro per Tonne","759"
"AJM09C01","Fertiliser Price","202605","2026 May","008","Compound 0-7-30","Euro per Tonne","569"
"AJM09C01","Fertiliser Price","202605","2026 May","012","Compound 18-6-12","Euro per Tonne","651"
"AJM09C01","Fertiliser Price","202605","2026 May","020","Compound 10-5-25","Euro per Tonne","646"
"AJM09C01","Fertiliser Price","202605","2026 May","0201","Compound 10-7-23","Euro per Tonne",""
"AJM09C01","Fertiliser Price","202606","2026 June","002","Urea (46% N)","Euro per Tonne","747"
"AJM09C01","Fertiliser Price","202606","2026 June","008","Compound 0-7-30","Euro per Tonne","568"
"AJM09C01","Fertiliser Price","202606","2026 June","012","Compound 18-6-12","Euro per Tonne","647"
"AJM09C01","Fertiliser Price","202606","2026 June","020","Compound 10-5-25","Euro per Tonne","646"
"AJM09C01","Fertiliser Price","202606","2026 June","0201","Compound 10-7-23","Euro per Tonne",""
"AJM09C01","Fertiliser Price","202607","2026 July","002","Urea (46% N)","Euro per Tonne","718"
"AJM09C01","Fertiliser Price","202607","2026 July","008","Compound 0-7-30","Euro per Tonne","561"
"AJM09C01","Fertiliser Price","202607","2026 July","012","Compound 18-6-12","Euro per Tonne","645"
"AJM09C01","Fertiliser Price","202607","2026 July","020","Compound 10-5-25","Euro per Tonne","643"
"AJM09C01","Fertiliser Price","202607","2026 July","0201","Compound 10-7-23","Euro per Tonne",""
`;

/** Genuine JSON-stat metadata fields, captured live 2026-09-20 from
 * `PxStat.Data.Cube_API.ReadDataset/AJM09/JSON-stat/2.0/en` (trimmed to
 * the fields this pipeline actually reads). */
export const CSO_AJM09_REAL_METADATA_SAMPLE = JSON.stringify({
  class: "dataset",
  label: "Fertiliser Price (Euro per Tonne)",
  updated: "2026-09-15T11:00:00.000Z",
  extension: {
    matrix: "AJM09",
    reasons: ["Planned Routine Revision"],
    official: true,
    product: { code: "OIIAP", value: "Agricultural Input and Output Absolute Prices" },
  },
});
