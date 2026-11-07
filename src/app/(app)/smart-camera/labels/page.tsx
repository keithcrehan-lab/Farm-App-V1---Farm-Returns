'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, QrCode, ShieldCheck } from 'lucide-react';
import { useFields } from '@/store/farm-store';
import { buildFieldQrLink } from '@/lib/smart-camera/field-qr';

/** Render locally: no field data or IDs sent to a third-party QR service. */
function FieldLabel({ id, name }: { id: string; name: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const link = buildFieldQrLink(window.location.origin, id);
    import('qrcode').then(({ toDataURL }) => toDataURL(link, { width: 280, margin: 2, errorCorrectionLevel: 'M' }))
      .then((data) => { if (!cancelled) setSrc(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <article className="break-inside-avoid rounded-xl border border-fr-border bg-white p-5 text-center text-fr-ink-900 print:border-black">
      <p className="text-sm font-semibold text-fr-green-700 print:text-black">Farm Return</p>
      <h2 className="mt-1 break-words font-display text-xl font-semibold">{name}</h2>
      {src ? (
        <div>
          {/* QR code is local data, not a hosted image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`QR code opening the field ${name}`} width={280} height={280} className="mx-auto my-2 max-w-full" />
        </div>
      ) : (
        <div className="mx-auto my-2 flex aspect-square w-[280px] max-w-full items-center justify-center bg-fr-surface-alt text-sm text-fr-ink-600">
          {error ? 'QR code unavailable' : 'Generating QR code…'}
        </div>
      )}
      <p className="text-xs text-fr-ink-600">Scan to open this field in Farm Return</p>
      <p className="mt-1 break-all text-[10px] text-fr-ink-600">Field ID: {id}</p>
    </article>
  );
}

export default function SmartCameraLabelsPage() {
  const fields = useFields();
  return (
    <main className="mx-auto max-w-4xl space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link href="/smart-camera" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-fr-green-700"><ArrowLeft className="size-4"/>Back to Smart Camera</Link>
          <h1 className="font-display text-3xl font-semibold text-fr-ink-900">Field QR labels</h1>
          <p className="mt-2 text-sm text-fr-ink-600">Print labels for your mapped fields and attach them to the correct gate or field record.</p>
        </div>
        <button type="button" disabled={fields.length === 0} onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-fr-control bg-fr-green-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Printer className="size-4"/>Print labels</button>
      </header>
      <p className="flex items-start gap-2 text-xs text-fr-ink-600 print:hidden"><ShieldCheck className="size-4 shrink-0"/>Codes are generated on your device and identify a field only; they do not grant access. Opening a record still requires the farmer&apos;s normal Farm Return sign-in and permissions.</p>
      {fields.length === 0 ? (
        <div className="rounded-xl border border-fr-border bg-white p-8 text-center"><QrCode className="mx-auto mb-3 size-8 text-fr-ink-600"/><p className="font-semibold">No active fields to label</p><Link href="/fields" className="mt-3 inline-block text-sm font-semibold text-fr-green-700">Open Farm Map</Link></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
          {fields.map((field) => <FieldLabel key={field.id} id={field.id} name={field.name} />)}
        </div>
      )}
    </main>
  );
}
