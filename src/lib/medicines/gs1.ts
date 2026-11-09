/**
 * GS1 element-string parsing for medicine packs.
 *
 * Veterinary medicine packs carry a GS1 DataMatrix encoding the product GTIN
 * (AI 01), expiry (AI 17), batch (AI 10) and sometimes a serial (AI 21).
 * Scanners return this either raw (variable fields terminated by the ASCII
 * group separator, optionally prefixed by a symbology identifier such as
 * `]d2`) or human-readable with brackets: `(01)…(17)…(10)…`.
 *
 * A plain linear EAN/UPC barcode yields only a GTIN. Nothing is guessed: if
 * the string cannot be parsed exactly, the result is `null`.
 */

export interface MedicinePackScan {
  /** 14-digit GTIN with a valid check digit. */
  gtin: string;
  batch: string | null;
  /** ISO date (YYYY-MM-DD). A GS1 day of 00 means the last day of that month. */
  expiry: string | null;
  serial: string | null;
  /** `datamatrix` when the scan carried GS1 application identifiers, else `barcode`. */
  source: "datamatrix" | "barcode";
}

const GS = "\u001d";

/** Fixed-length AIs (data length, excluding the AI itself). */
const FIXED: Record<string, number> = {
  "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2,
};
/** Variable-length AIs we can safely step over (max data length). */
const VARIABLE: Record<string, number> = {
  "10": 20, "21": 20, "22": 20, "30": 8, "37": 8, "240": 30, "241": 30, "250": 30, "251": 30,
  "710": 20, "711": 20, "712": 20, "713": 20, "714": 20, "715": 20,
  "91": 90, "92": 90, "93": 90, "94": 90, "95": 90, "96": 90, "97": 90, "98": 90, "99": 90,
};

export function gtinCheckDigitValid(digits: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Normalises a GTIN-8/12/13/14 to 14 digits, or `null` if invalid. */
export function toGtin14(value: string): string | null {
  const digits = value.replace(/\s+/g, "");
  if (!gtinCheckDigitValid(digits)) return null;
  return digits.padStart(14, "0");
}

function gs1Date(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === 0) day = lastDay;
  if (day > lastDay) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseBracketed(input: string): Map<string, string> | null {
  const re = /\((\d{2,4})\)([^(]*)/g;
  const out = new Map<string, string>();
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = re.exec(input))) {
    out.set(match[1], match[2].trim());
    consumed += match[0].length;
  }
  return out.size && consumed === input.length ? out : null;
}

function aiAt(data: string, i: number): string | null {
  for (const len of [2, 3]) {
    const ai = data.slice(i, i + len);
    if (ai in FIXED || ai in VARIABLE) return ai;
  }
  return null;
}

function parseRaw(input: string): Map<string, string> | null {
  const data = input.replace(/^\][A-Za-z]\d/, "");
  const out = new Map<string, string>();
  let i = 0;
  while (i < data.length) {
    if (data[i] === GS) { i++; continue; }
    const ai = aiAt(data, i);
    if (!ai) return null;
    i += ai.length;
    if (ai in FIXED) {
      const value = data.slice(i, i + FIXED[ai]);
      if (value.length !== FIXED[ai] || !/^\d+$/.test(value)) return null;
      out.set(ai, value);
      i += FIXED[ai];
    } else {
      const end = data.indexOf(GS, i);
      const value = data.slice(i, end === -1 ? data.length : end);
      if (!value.length || value.length > VARIABLE[ai]) return null;
      out.set(ai, value);
      i = end === -1 ? data.length : end + 1;
    }
  }
  return out.size ? out : null;
}

export function parseMedicinePackScan(raw: string): MedicinePackScan | null {
  if (typeof raw !== "string") return null;
  const input = raw.trim();
  if (!input || input.length > 200) return null;

  // Plain linear barcode (EAN-8/13, UPC-A, GTIN-14).
  if (/^\d{8}$|^\d{12,14}$/.test(input)) {
    const gtin = toGtin14(input);
    return gtin ? { gtin, batch: null, expiry: null, serial: null, source: "barcode" } : null;
  }

  const fields = input.startsWith("(") ? parseBracketed(input) : parseRaw(input);
  if (!fields) return null;
  const gtinRaw = fields.get("01");
  const gtin = gtinRaw ? toGtin14(gtinRaw) : null;
  if (!gtin) return null;
  const expiryRaw = fields.get("17");
  const expiry = expiryRaw ? gs1Date(expiryRaw) : null;
  if (expiryRaw && !expiry) return null;
  return {
    gtin,
    batch: fields.get("10") ?? null,
    expiry,
    serial: fields.get("21") ?? null,
    source: "datamatrix",
  };
}
