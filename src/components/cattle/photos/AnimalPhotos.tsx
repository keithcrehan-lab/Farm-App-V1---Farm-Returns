"use client";

/**
 * Cattle C10 — animal photos (session only). The identity image shows the
 * primary photo or an honest empty frame; the gallery adds photos (camera or
 * file picker), sets the primary and removes. Nothing is uploaded.
 */

import { useRef } from "react";
import { useCattleDemoSession } from "../session/CattleDemoSessionProvider";
import { cattleStyles } from "../ui";

export function PrimaryPhoto({ animalId, tag }: { animalId: string; tag: string }) {
  const { photos, photoVersion } = useCattleDemoSession();
  const primary = photos.primary(animalId);
  void photoVersion;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[6px] bg-fr-v2-plum-tint sm:w-56">
      {primary ? (
        // eslint-disable-next-line @next/next/no-img-element -- session object URL, not an optimisable asset
        <img key={primary.photoId} src={primary.url} alt={`Animal ${tag}`} className={`h-full w-full object-cover ${cattleStyles.settle}`} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-fr-v2-plum">
          <svg viewBox="0 0 64 40" className="h-10 w-16" aria-hidden fill="currentColor" opacity="0.55">
            <path d="M10 14c0-3 3-5 7-5h22c3 0 6-2 8-4l3 1c1 0 2 2 1 3l-2 2c2 1 4 3 4 6v3c0 1-1 2-2 2h-2v12h-4V24H18v10h-4V22c-2-1-4-4-4-8z" />
          </svg>
          <span className="text-[12px]">No photo yet</span>
        </div>
      )}
    </div>
  );
}

export function PhotoGallery({ animalId, tag }: { animalId: string; tag: string }) {
  const { photos, photoVersion, bumpPhotos } = useCattleDemoSession();
  const input = useRef<HTMLInputElement>(null);
  const list = photos.list(animalId);
  const primary = photos.primary(animalId);
  void photoVersion;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => input.current?.click()} className="min-h-11 rounded-[8px] border border-fr-v2-forest px-4 text-sm font-semibold text-fr-v2-forest">
          Add photo
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          aria-label={`Add photos of animal ${tag}`}
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) photos.add(animalId, f, f.name);
            e.target.value = "";
            bumpPhotos();
          }}
        />
        <span className="text-[12px] text-fr-v2-muted">Kept in this browser tab only — not uploaded or saved.</span>
      </div>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-fr-v2-muted">No photos of {tag} yet.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label={`Photos of ${tag}`}>
          {list.map((p) => {
            const isPrimary = primary?.photoId === p.photoId;
            return (
              <li key={p.photoId} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- session object URL */}
                <img src={p.url} alt={`${tag}, ${p.fileName}`} className={`aspect-square w-full rounded-[6px] object-cover ${isPrimary ? "ring-2 ring-fr-v2-forest ring-offset-2" : ""}`} />
                <div className="mt-1 flex items-center justify-between gap-1">
                  {isPrimary ? (
                    <span className="text-[12px] font-medium text-fr-v2-forest">Profile photo</span>
                  ) : (
                    <button
                      type="button"
                      className="min-h-11 text-[12px] font-medium text-fr-v2-forest"
                      onClick={() => {
                        photos.setPrimary(animalId, p.photoId);
                        bumpPhotos();
                      }}
                    >
                      Use as profile
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove photo ${p.fileName}`}
                    className="min-h-11 min-w-8 text-[12px] text-fr-v2-muted"
                    onClick={() => {
                      photos.remove(animalId, p.photoId);
                      bumpPhotos();
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
