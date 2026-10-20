/**
 * Cattle C10 — animal photos: the application boundary. C0–C9 have no photo
 * contract and no storage owner is decided, so tonight's only adapter is a
 * client-only SESSION store: photos are object URLs in this browser tab,
 * never uploaded and gone on reload. A persistent adapter (storage bucket +
 * table) can implement the same interface once its owner is authorised.
 */

export interface AnimalPhoto {
  photoId: string;
  animalId: string;
  /** Object URL (session) — never a server URL in this adapter. */
  url: string;
  addedOrder: number;
  fileName: string;
}

export interface AnimalPhotoStore {
  readonly persistence: "SESSION_ONLY";
  list(animalId: string): AnimalPhoto[];
  /** The primary photo, or `null` when the animal has none. */
  primary(animalId: string): AnimalPhoto | null;
  add(animalId: string, file: Blob, fileName: string): AnimalPhoto;
  setPrimary(animalId: string, photoId: string): boolean;
  remove(animalId: string, photoId: string): boolean;
  clear(): void;
}

type UrlFactory = { create: (b: Blob) => string; revoke: (u: string) => void };

const browserUrls: UrlFactory = {
  create: (b) => URL.createObjectURL(b),
  revoke: (u) => URL.revokeObjectURL(u),
};

/**
 * Session store. The first photo added becomes primary; removing the primary
 * makes the earliest remaining photo primary; order is insertion order.
 */
export function createSessionPhotoStore(urls: UrlFactory = browserUrls): AnimalPhotoStore {
  const photos = new Map<string, AnimalPhoto[]>();
  const primaryOf = new Map<string, string>();
  let order = 0;
  return {
    persistence: "SESSION_ONLY",
    list: (animalId) => [...(photos.get(animalId) ?? [])],
    primary(animalId) {
      const list = photos.get(animalId) ?? [];
      const id = primaryOf.get(animalId);
      return list.find((p) => p.photoId === id) ?? null;
    },
    add(animalId, file, fileName) {
      order += 1;
      const photo: AnimalPhoto = { photoId: `photo-${order}`, animalId, url: urls.create(file), addedOrder: order, fileName };
      const list = [...(photos.get(animalId) ?? []), photo];
      photos.set(animalId, list);
      if (!primaryOf.has(animalId)) primaryOf.set(animalId, photo.photoId);
      return photo;
    },
    setPrimary(animalId, photoId) {
      if (!(photos.get(animalId) ?? []).some((p) => p.photoId === photoId)) return false;
      primaryOf.set(animalId, photoId);
      return true;
    },
    remove(animalId, photoId) {
      const list = photos.get(animalId) ?? [];
      const hit = list.find((p) => p.photoId === photoId);
      if (!hit) return false;
      urls.revoke(hit.url);
      const rest = list.filter((p) => p.photoId !== photoId);
      photos.set(animalId, rest);
      if (primaryOf.get(animalId) === photoId) {
        if (rest.length > 0) primaryOf.set(animalId, rest[0].photoId);
        else primaryOf.delete(animalId);
      }
      return true;
    },
    clear() {
      for (const list of photos.values()) for (const p of list) urls.revoke(p.url);
      photos.clear();
      primaryOf.clear();
    },
  };
}
