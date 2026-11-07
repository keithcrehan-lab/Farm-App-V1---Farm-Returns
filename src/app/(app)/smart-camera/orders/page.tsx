import Link from 'next/link';
import OrdersClient from './OrdersClient';

/**
 * A feature gate: the immutable purchase/delivery schema and manufacturer
 * verified catalogue have not completed DB security acceptance. Never
 * expose a form that will fail on submit simply because tables are absent.
 * This is server-side and defaults CLOSED for all environments.
 */
export default function CameraOrdersPage() {
  if (process.env.SMART_CAMERA_ORDERS_ENABLED !== 'true') {
    return (
      <main className="mx-auto max-w-2xl space-y-5 pb-10 text-fr-v2-graphite">
        <Link href="/smart-camera" className="inline-flex min-h-11 items-center text-sm font-semibold text-fr-v2-forest underline underline-offset-4">← Smart Camera</Link>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-fr-v2-muted">Farm Return · Early access</p>
        <h1 className="font-display text-[32px] font-normal leading-tight">Orders and deliveries</h1>
        <div className="border-l-2 border-fr-v2-gold bg-fr-v2-cream p-5">
          <p className="font-semibold">Coming soon</p>
          <p className="mt-2 text-sm leading-relaxed text-fr-v2-charcoal">Product scanning and field QR labels can be tested now. The purchase-order and delivery recording screens will open only after the verified product catalogue, database permissions and transaction checks have passed release testing.</p>
          <p className="mt-2 text-sm text-fr-v2-charcoal">Existing fertiliser quote requests are unchanged. A quote is not a confirmed purchase order.</p>
        </div>
      </main>
    );
  }
  return <OrdersClient />;
}
