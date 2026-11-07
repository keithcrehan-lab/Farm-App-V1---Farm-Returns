'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CameraOff, CheckCircle2, ScanBarcode, ShieldCheck, AlertCircle, QrCode } from 'lucide-react';
import { useFields, useIsRealMode } from '@/store/farm-store';
import { lookupScannedFertiliserProductAction, type ProductScanResult } from '@/app/actions/smart-camera';
import { normaliseGtin } from '@/lib/smart-camera/fertiliser-products';
import { Gs1FreeLookupPanel } from '@/components/farm/Gs1FreeLookupPanel';
import { PublicBarcodeResults } from '@/components/farm/PublicBarcodeResults';
import { AddFertiliserStockRecordSheet } from '@/components/farm/AddFertiliserStockRecordSheet';
import { resolveFieldScan } from '@/lib/smart-camera/resolve';

type DetectedCode = { rawValue: string };
type Detector = { detect(source: HTMLVideoElement): Promise<DetectedCode[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export default function SmartCameraPage() {
  const fields = useFields();
  const isRealMode = useIsRealMode();
  const [lookup, setLookup] = useState<ProductScanResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const valueRef = useRef('');
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const videoElement = video.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopFallback: (() => void) | undefined;
    async function start() {
      const DetectorClass = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!DetectorClass) {
        // Safari/iOS commonly lacks native BarcodeDetector. Use the ZXing
        // browser decoder rather than leaving iPhone farmers unable to scan.
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (cancelled || !videoElement) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            videoElement,
            (found, _error, scanControls) => {
              if (cancelled || !found) return;
              const scanned = found.getText();
              valueRef.current = scanned;
              setValue(scanned);
              setLookup(null);
              scanControls.stop();
              setActive(false);
            },
          );
          stopFallback = () => controls.stop();
          if (cancelled) controls.stop();
        } catch {
          if (!cancelled) {
            setMessage('Camera scanner is unavailable. Check camera permission or enter the barcode manually.');
            setActive(false);
          }
        }
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) { media.getTracks().forEach((t) => t.stop()); return; }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
        const detector = new DetectorClass({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'data_matrix'] });
        async function poll() {
          if (cancelled || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes.length && codes[0].rawValue) {
              valueRef.current = codes[0].rawValue;
              setValue(codes[0].rawValue);
              setLookup(null);
              setActive(false);
              return;
            }
          } catch { /* A dropped frame is not a recognised value. */ }
          if (!cancelled) timer = setTimeout(poll, 300);
        }
        await poll();
      } catch {
        if (!cancelled) { setMessage('Camera access was unavailable. Check camera permissions or enter the code manually.'); setActive(false); }
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopFallback?.();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (videoElement) videoElement.srcObject = null;
    };
  }, [active]);

  async function lookupProduct() {
    const scan = value;
    setLookup(null);
    setLookingUp(true);
    try {
      const found = await lookupScannedFertiliserProductAction(scan);
      // Ignore stale responses after the farmer scans/enters a different code.
      if (valueRef.current === scan) setLookup(found);
    } finally {
      setLookingUp(false);
    }
  }

  function openStockForm() {
    if (lookup?.status !== 'verified' || !isRealMode) return;
    setMessage('');
    setStockOpen(true);
  }

  const result = resolveFieldScan(value, fields.map((field) => field.id));
  const field = result.kind === 'field' ? fields.find((item) => item.id === result.fieldId) : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8 text-fr-v2-graphite">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-fr-green-700"><ScanBarcode className="size-5"/><span className="text-sm font-semibold">Smart Camera · Early access</span></div>
        <h1 className="font-display text-[32px] font-normal leading-tight text-fr-v2-graphite">Scan products and field labels</h1>
        <p className="text-sm text-fr-ink-600">Scan a product barcode or a field QR label. Check manufacturer-verified products or view suggestions from free barcode databases. Unverified results never change farm records.</p>
      </header>
      <section className="space-y-4 border border-fr-v2-cream-rule bg-fr-v2-cream p-4 sm:p-6">
        {active ? (
          <div className="overflow-hidden rounded-xl bg-black"><video ref={video} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" aria-label="Live camera preview" /></div>
        ) : (
          <div className="flex aspect-[4/2] flex-col items-center justify-center gap-3 rounded-xl bg-fr-surface-alt text-fr-ink-600"><Camera className="size-10"/><span className="text-sm">Camera is off</span></div>
        )}
        <button type="button" onClick={() => { setMessage(''); setActive((was) => !was); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fr-green-700 px-4 py-3 font-semibold text-white hover:bg-fr-green-800">
          {active ? <CameraOff className="size-5"/> : <Camera className="size-5"/>}{active ? 'Stop camera' : 'Scan QR or barcode'}
        </button>
        <label htmlFor="scanned-code" className="block text-sm font-semibold text-fr-ink-900">Or enter / paste a scanned code</label>
        <input id="scanned-code" value={value} onChange={(event) => { valueRef.current = event.target.value; setValue(event.target.value); setLookup(null); }} placeholder="Field QR code, field link or product barcode" className="w-full rounded-xl border border-fr-border bg-white px-3 py-3 text-sm text-fr-ink-900" />
        {message && <p role="status" className="flex gap-2 text-sm text-fr-ink-600"><AlertCircle className="size-4 shrink-0" />{message}</p>}
        {field ? (
          <div className="space-y-3 rounded-xl border border-fr-green-700/30 bg-fr-surface-alt p-4" role="status">
            <p className="flex items-center gap-2 text-sm font-semibold text-fr-green-700"><CheckCircle2 className="size-5"/>Exact field ID matched</p>
            <p className="font-semibold text-fr-ink-900">{field.name}</p>
            <Link href={`/fields?field=${encodeURIComponent(field.id)}`} className="inline-flex rounded-lg bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white">Open this field</Link>
          </div>
        ) : value.trim() ? (
          <div role="status" className="space-y-3 border-t border-fr-v2-cream-rule pt-4 text-sm text-fr-ink-600">
            {normaliseGtin(value) ? (
              <>
                <p className="font-semibold text-fr-v2-graphite">Product barcode detected</p>
                <p>Choose a product lookup below. A valid GTIN does not guarantee a matching product or verified nutrient information.</p>
                <button type="button" onClick={() => void lookupProduct()} disabled={lookingUp || !isRealMode}
                  className="rounded-fr-control bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {lookingUp ? 'Checking catalogue…' : 'Look up fertiliser product'}
                </button>
                {!isRealMode ? <p>Sign in to check the curated product catalogue.</p> : null}
                <PublicBarcodeResults key={value} code={value} signedIn={isRealMode} />
                <Gs1FreeLookupPanel code={value} />
                {lookup?.status === 'verified' ? (
                  <div className="space-y-2 rounded-xl border border-fr-green-700/30 bg-fr-surface-alt p-3 text-fr-ink-900">
                    <p className="flex items-center gap-2 font-semibold text-fr-green-700"><CheckCircle2 className="size-4"/>Exact curated barcode match</p>
                    <p className="font-semibold">{lookup.product.productName}</p>
                    {lookup.product.declaredAnalysis ? <p>Declared analysis: {lookup.product.declaredAnalysis}</p> : null}
                    <p className="text-xs">Source: <a href={lookup.product.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{lookup.product.sourceName}</a> · Reviewed {lookup.product.reviewedAt}</p>
                    <p className="text-xs">Product identity matched; the amount you actually have must still be confirmed.</p>
                    <button type="button" onClick={openStockForm} className="rounded-fr-control bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      Record stock observation
                    </button>
                  </div>
                ) : lookup ? (
                  <p>{lookup.status === 'invalid' ? 'Invalid GTIN check digit.' : lookup.status === 'unavailable' ? 'Catalogue unavailable. No identity can be confirmed.' : 'No verified catalogue match. Do not assume product identity.'}</p>
                ) : null}
              </>
            ) : <p>No field QR label matches an active field in this farm. Check the label or scan a valid product barcode. No record has changed.</p>}
          </div>
        ) : null}
      </section>
      {lookup?.status === 'verified' ? (
        <AddFertiliserStockRecordSheet
          open={stockOpen}
          onClose={() => setStockOpen(false)}
          onSaved={() => {
            setStockOpen(false);
            setMessage('Dated stock observation saved. This does not mean a delivery or a running balance was updated.');
          }}
          products={[lookup.product.productName]}
          defaultProduct={lookup.product.productName}
          defaultSource={`Farmer counted stock after GTIN scan ${normaliseGtin(value) ?? ''}`}
        />
      ) : null}
      <Link href={lookup?.status === "verified" ? `/smart-camera/orders?gtin=${encodeURIComponent(lookup.product.barcode)}` : "/smart-camera/orders"} className="flex items-center justify-center gap-2 border border-fr-v2-cream-rule bg-fr-v2-cream px-4 py-3 text-sm font-semibold text-fr-green-700 hover:bg-fr-surface-alt"><CheckCircle2 className="size-5"/>Orders and delivery receipts</Link>
      <Link href="/smart-camera/labels" className="flex items-center justify-center gap-2 border border-fr-v2-cream-rule bg-fr-v2-cream px-4 py-3 text-sm font-semibold text-fr-green-700 hover:bg-fr-surface-alt"><QrCode className="size-5"/>Generate and print field QR labels</Link>
      <p className="flex items-start gap-2 text-xs text-fr-ink-600"><ShieldCheck className="size-4 shrink-0" />Scans do not automatically create transactions, treatments, applications or measurements. Only assigned fields and curated product barcodes can be matched automatically. Free GS1 results are viewed separately and do not create verified records. Stock quantities always need farmer confirmation.</p>
    </div>
  );
}
