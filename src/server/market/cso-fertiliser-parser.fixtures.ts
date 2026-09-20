/** Deterministic, hand-built fixtures for `cso-fertiliser-parser.test.ts`
 * — structural edge cases a real live response is unlikely to hand us on
 * demand. `cso-fertiliser-client.real-fixtures.ts` covers the genuine
 * happy path with real captured data; these cover the failure shapes. */

const HEADER = `"STATISTIC","Statistic Label","TLIST(M1)","Month","C02069V02500","Type of Fertiliser","UNIT","VALUE"`;

export const VALID_MINIMAL_CSV = `${HEADER}
"AJM09C01","Fertiliser Price","202607","2026 July","012","Compound 18-6-12","Euro per Tonne","645"
"AJM09C01","Fertiliser Price","202607","2026 July","008","Compound 0-7-30","Euro per Tonne","561"
`;

export const MALFORMED_HEADER_CSV = `"COLUMN_A","COLUMN_B"
"foo","bar"
`;

export const EMPTY_BODY_CSV = "";

export const HEADER_ONLY_NO_DATA_CSV = `${HEADER}\n`;

/** A row with too few fields — missing dimensions. */
export const MISSING_DIMENSIONS_CSV = `${HEADER}
"AJM09C01","Fertiliser Price","202607","012","Compound 18-6-12","645"
"AJM09C01","Fertiliser Price","202607","2026 July","008","Compound 0-7-30","Euro per Tonne","561"
`;

/** A genuinely missing observation (empty VALUE) alongside a valid one —
 * must never be treated as €0. */
export const MISSING_VALUE_CSV = `${HEADER}
"AJM09C01","Fertiliser Price","202607","2026 July","0201","Compound 10-7-23","Euro per Tonne",""
"AJM09C01","Fertiliser Price","202607","2026 July","012","Compound 18-6-12","Euro per Tonne","645"
`;

/** VALUE that isn't a real decimal — garbage/text where a price is
 * expected. */
export const INVALID_DECIMAL_CSV = `${HEADER}
"AJM09C01","Fertiliser Price","202607","2026 July","012","Compound 18-6-12","Euro per Tonne","N/A"
"AJM09C01","Fertiliser Price","202607","2026 July","008","Compound 0-7-30","Euro per Tonne","561"
`;

/** A unit CSO doesn't publish for this dataset — must be rejected, not
 * silently accepted as €/tonne. */
export const UNSUPPORTED_UNIT_CSV = `${HEADER}
"AJM09C01","Fertiliser Price","202607","2026 July","012","Compound 18-6-12","US Dollar per Short Ton","700"
"AJM09C01","Fertiliser Price","202607","2026 July","008","Compound 0-7-30","Euro per Tonne","561"
`;

/** Every row malformed — the whole batch must be treated as an
 * unrecognised schema, not 100% independently-malformed data. */
export const ALL_ROWS_MALFORMED_CSV = `${HEADER}
"AJM09C01","Fertiliser Price","202607","2026 July","012","Compound 18-6-12","Euro per Tonne","N/A"
"AJM09C01","Fertiliser Price","202607","2026 July","008","Compound 0-7-30","Euro per Tonne","garbage"
`;

export const VALID_MINIMAL_METADATA_JSON = JSON.stringify({
  updated: "2026-09-15T11:00:00.000Z",
  extension: { reasons: ["Planned Routine Revision"] },
});

export const MALFORMED_METADATA_JSON = "not json at all {{{";
