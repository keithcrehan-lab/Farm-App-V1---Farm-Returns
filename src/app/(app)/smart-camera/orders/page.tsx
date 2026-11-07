'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, PackageCheck, AlertCircle } from 'lucide-react';
import {
  confirmSmartCameraPurchaseOrderAction,
  listSmartCameraOrdersAction,
  recordSmartCameraDeliveryAction,
} from '@/app/actions/smart-camera';
import type { CameraOrder } from '@/lib/farm-data/smart-camera-orders';
import { normaliseGtin } from '@/lib/smart-camera/fertiliser-products';

const control = 'mt-1 min-h-11 w-full rounded-fr-v2-control border border-fr-v2-cream-rule bg-white px-3 py-2.5 text-sm text-fr-v2-graphite';
const button = 'min-h-11 rounded-fr-v2-control bg-fr-v2-forest-deep px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
const today = () => {
  const now = new Date();
  const parts = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')];
  return parts.join('-');
};

export default function CameraOrdersPage() {
  const [orders, setOrders] = useState<CameraOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [productGtin, setProductGtin] = useState('');
  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get('gtin') ?? '';
    // The URL is an external deep-link source, so synchronise this optional prefill once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (normaliseGtin(candidate)) setProductGtin(candidate);
  }, []);
  const [supplierName, setSupplierName] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [orderedKg, setOrderedKg] = useState('');
  const [confirmedDate, setConfirmedDate] = useState('');
  const [confirmationSource, setConfirmationSource] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [receivedKg, setReceivedKg] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  useEffect(() => {
    // Client-local dates must not be rendered from different server/client time zones.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmedDate(today());
    setReceivedDate(today());
  }, []);
  const [docketConfirmed, setDocketConfirmed] = useState(false);

  const refresh = useCallback(async () => {
    const records = await listSmartCameraOrdersAction();
    setOrders(records);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSmartCameraOrdersAction().then((records) => {
      if (!cancelled) { setOrders(records); setLoading(false); }
    }, () => {
      if (!cancelled) { setError('Orders could not be loaded. Check your connection or the database setup.'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  const selectedOrder = orders.find((o) => o.id === orderId);

  async function saveOrder(event: React.FormEvent) {
    event.preventDefault();
    setNotice(''); setError('');
    if (!confirmed) { setError('Confirm that the supplier accepted this purchase order.'); return; }
    setSaving(true);
    try {
      const result = await confirmSmartCameraPurchaseOrderAction({
        productGtin, supplierName, supplierReference,
        orderedKg: Number(orderedKg), confirmedDate, confirmationSource,
      });
      if (!result.ok) { setError(result.error); return; }
      setNotice('Farmer-confirmed purchase order saved. This is not a supplier-verification service.');
      setConfirmed(false); setOrderedKg(''); setConfirmationSource('');
      await refresh();
      setOrderId(result.id);
    } catch { setError('Could not save this order. No confirmation was recorded.'); }
    finally { setSaving(false); }
  }

  async function saveDelivery(event: React.FormEvent) {
    event.preventDefault(); setNotice(''); setError('');
    if (!selectedOrder || !docketConfirmed) { setError('Select an order and confirm the delivery docket details.'); return; }
    setSaving(true);
    try {
      const result = await recordSmartCameraDeliveryAction({
        orderId: selectedOrder.id, productGtin: selectedOrder.productGtin,
        receivedKg: Number(receivedKg), deliveryReference, receivedDate,
      });
      if (!result.ok) { setError(result.error); return; }
      setNotice('Delivery receipt recorded. Stock observations are unchanged until you count and record stock separately.');
      setDocketConfirmed(false); setDeliveryReference(''); setReceivedKg('');
      await refresh();
    } catch { setError('Could not record the delivery. No receipt was confirmed.'); }
    finally { setSaving(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 pb-8 text-fr-v2-graphite">
      <header>
        <Link href="/smart-camera" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fr-green-700"><ArrowLeft className="size-4"/>Smart Camera</Link>
        <h1 className="font-display text-[32px] font-normal leading-tight text-fr-v2-graphite">Orders and deliveries</h1>
        <p className="mt-2 text-sm text-fr-ink-600">Confirm an actual order before recording deliveries against it. A quote request alone is not an order.</p>
      </header>
      {error ? <p role="alert" className="flex items-center gap-2 rounded-lg bg-fr-attention-bg p-3 text-sm text-fr-attention"><AlertCircle className="size-4"/>{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-fr-border bg-fr-surface p-3 text-sm text-fr-green-700">{notice}</p> : null}
      <section className="space-y-4 border border-fr-v2-cream-rule bg-fr-v2-cream p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fr-ink-900"><ClipboardCheck className="size-5"/>1. Confirm a purchase order</h2>
        <p className="text-sm text-fr-ink-600">Only a barcode already in the curated verified catalogue can be used. Confirm the actual supplier, reference and ordered quantity from your evidence.</p>
        <form onSubmit={(e) => void saveOrder(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-fr-ink-900">Verified product GTIN<input required className={control} value={productGtin} onChange={(e) => setProductGtin(e.target.value)} placeholder="Scan or paste the barcode" /></label>
          <label className="text-sm text-fr-ink-900">Supplier<input required className={control} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></label>
          <label className="text-sm text-fr-ink-900">Supplier order reference<input required className={control} value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} /></label>
          <label className="text-sm text-fr-ink-900">Quantity ordered (kg)<input required className={control} type="number" min="0.01" step="any" value={orderedKg} onChange={(e) => setOrderedKg(e.target.value)} /></label>
          <label className="text-sm text-fr-ink-900">Date confirmed<input required className={control} type="date" max={today()} value={confirmedDate} onChange={(e) => setConfirmedDate(e.target.value)} /></label>
          <label className="text-sm text-fr-ink-900">Confirmation evidence<input required className={control} value={confirmationSource} onChange={(e) => setConfirmationSource(e.target.value)} placeholder="e.g. supplier email, signed PO" /></label>
          <label className="flex items-start gap-2 text-sm text-fr-ink-900 sm:col-span-2"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}/>I confirm the supplier accepted this order and the details come from real evidence.</label>
          <button type="submit" disabled={saving || loading || !normaliseGtin(productGtin)} className={`${button} sm:col-span-2`}>{saving ? 'Saving…' : 'Save confirmed purchase order'}</button>
        </form>
      </section>
      <section className="space-y-4 border border-fr-v2-cream-rule bg-fr-v2-cream p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fr-ink-900"><PackageCheck className="size-5"/>2. Record a delivery against an order</h2>
        {loading ? <p className="text-sm text-fr-ink-600">Loading orders…</p> : orders.length === 0 ? <p className="text-sm text-fr-ink-600">No confirmed purchase orders yet.</p> : (
          <form onSubmit={(e) => void saveDelivery(e)} className="space-y-3">
            <label className="block text-sm text-fr-ink-900">Confirmed order
              <select className={control} required value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">Choose an order</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.supplierReference} · {o.supplierName} · {o.productName}</option>)}
              </select>
            </label>
            {selectedOrder ? <p className="rounded-lg bg-fr-surface-alt p-3 text-sm text-fr-ink-900">Ordered: {selectedOrder.orderedKg} kg · Recorded deliveries: {selectedOrder.receivedKg} kg · Remaining: {selectedOrder.orderedKg-selectedOrder.receivedKg} kg</p> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-fr-ink-900">Received quantity (kg)<input className={control} required min="0.01" step="any" type="number" value={receivedKg} onChange={(e) => setReceivedKg(e.target.value)}/></label>
              <label className="text-sm text-fr-ink-900">Delivery docket reference<input className={control} required value={deliveryReference} onChange={(e) => setDeliveryReference(e.target.value)}/></label>
              <label className="text-sm text-fr-ink-900">Delivery date<input className={control} required type="date" max={today()} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)}/></label>
            </div>
            <label className="flex items-start gap-2 text-sm text-fr-ink-900"><input type="checkbox" className="mt-1" checked={docketConfirmed} onChange={(e) => setDocketConfirmed(e.target.checked)}/>I checked the received product and quantity against the actual delivery docket.</label>
            <button type="submit" disabled={saving || !selectedOrder || !docketConfirmed} className={`${button} w-full`}>{saving ? 'Recording…' : 'Record confirmed delivery'}</button>
          </form>
        )}
      </section>
      <p className="text-xs text-fr-ink-600">This records the farmer&apos;s declarations and their provenance. It does not independently contact suppliers, verify invoices or change the current stock-balance observation.</p>
    </main>
  );
}
