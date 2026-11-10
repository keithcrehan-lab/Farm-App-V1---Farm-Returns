"use server";

/**
 * Stores a docket, label or knackery photo in the farm's private
 * record-evidence folder and, when reading is switched on, reads it into
 * suggested form values. Photos arrive already resized on the phone.
 */
import { createClient } from "@/lib/supabase/server";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { readRecordPhoto, type PhotoReading } from "@/server/records/read-photo";

const KINDS = ["feed", "spray", "health"] as const;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 4 * 1024 * 1024;

export async function uploadRecordPhotoAction(form: FormData): Promise<{ ok: true; path: string; reading: PhotoReading | { status: "skipped" } } | { ok: false; error: string }> {
  const kind = String(form.get("kind"));
  const file = form.get("photo");
  if (!(KINDS as readonly string[]).includes(kind) || !(file instanceof Blob)) return { ok: false, error: "Invalid request." };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a photo (JPEG, PNG or WebP)." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That photo is too big. Try again." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save photos." };
  const path = `${farm.id}/${kind}/${globalThis.crypto.randomUUID()}.${ext}`;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const supabase = await createClient();
    const { error } = await supabase.storage.from("record-evidence").upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;
    const reading = kind === "health" ? { status: "skipped" as const } : await readRecordPhoto(kind as "feed" | "spray", Buffer.from(bytes).toString("base64"), file.type);
    return { ok: true, path, reading };
  } catch (err) {
    console.error("[Records] photo upload failed", err);
    return { ok: false, error: "Couldn't save the photo just now. Check your signal and try again." };
  }
}
