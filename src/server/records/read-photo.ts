import "server-only";
/**
 * Reads a feed docket or a pesticide label photo into form values, using
 * the same image-reading model as the Teagasc growth reader. Only runs when
 * ANTHROPIC_API_KEY is set. Every value is a suggestion: the farmer checks
 * it in the form before anything is saved, and anything unreadable is left
 * blank rather than guessed.
 */
export type PhotoKind = "feed" | "spray";
export type PhotoReading =
  | { status: "read"; fields: Record<string, string> }
  | { status: "not_configured" }
  | { status: "failed" };

const PROMPTS: Record<PhotoKind, string> = {
  feed: `This is a photo of an animal feed delivery docket or invoice from an Irish farm. Return only JSON with any of these keys you can read with confidence:
{"receivedOn":"YYYY-MM-DD","supplierName":"","supplierAddress":"","product":"","batchNumber":"","quantity":"number only","unit":"tonnes|kg|bags|bales|litres"}
Leave out any key you cannot read clearly. Do not guess.`,
  spray: `This is a photo of a plant protection product (pesticide or herbicide) container label used in Ireland. Return only JSON with any of these keys you can read with confidence:
{"productName":"","pcsNumber":"digits only, the PCS number"}
Leave out any key you cannot read clearly. Do not guess.`,
};

const ALLOWED: Record<PhotoKind, Record<string, (v: string) => boolean>> = {
  feed: {
    receivedOn: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    supplierName: (v) => v.length <= 120,
    supplierAddress: (v) => v.length <= 300,
    product: (v) => v.length <= 120,
    batchNumber: (v) => v.length <= 60,
    quantity: (v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0,
    unit: (v) => ["tonnes", "kg", "bags", "bales", "litres"].includes(v),
  },
  spray: {
    productName: (v) => v.length <= 120,
    pcsNumber: (v) => /^\d{3,6}$/.test(v),
  },
};

/** Keeps only known keys with plausible values; drops everything else. */
export function parsePhotoReading(kind: PhotoKind, raw: string): Record<string, string> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  let obj: unknown;
  try { obj = JSON.parse(match[0]); } catch { return {}; }
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, check] of Object.entries(ALLOWED[kind])) {
    const v = (obj as Record<string, unknown>)[k];
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (s && check(s)) out[k] = s;
  }
  return out;
}

export async function readRecordPhoto(kind: PhotoKind, base64: string, mediaType: string): Promise<PhotoReading> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: "not_configured" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 400,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPTS[kind] },
        ] }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { status: "failed" };
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return { status: "read", fields: parsePhotoReading(kind, text) };
  } catch {
    return { status: "failed" };
  }
}
