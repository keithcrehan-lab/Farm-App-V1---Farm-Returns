"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import {
  createSupplierAction,
  grantSupplierMemberAction,
  revokeSupplierMemberAction,
  routeQuoteRequestToSupplierAction,
} from "@/app/actions/supplier-portal-operator";
import type { SupplierPortalActionResult } from "@/app/actions/supplier-portal";
import type { SupplierPortalOperatorOverview } from "@/lib/farm-data/supplier-portal";

const inputClass = "w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900";
const buttonClass = "rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

export interface OperatorRequestOption {
  id: string;
  label: string;
}

export function OperatorSuppliersClient({
  overview,
  activeRequests,
  unavailableReason,
}: {
  overview: SupplierPortalOperatorOverview | null;
  activeRequests: OperatorRequestOption[];
  unavailableReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [memberSupplier, setMemberSupplier] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "member">("admin");
  const [routeRequest, setRouteRequest] = useState("");
  const [routeSupplier, setRouteSupplier] = useState("");

  if (unavailableReason || !overview) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <h1 className="mb-1 text-title text-fr-ink-900">Suppliers</h1>
        <p className="rounded-fr-control border border-dashed border-fr-border py-8 text-center text-sm text-fr-ink-600">{unavailableReason}</p>
      </div>
    );
  }

  const activeSuppliers = overview.suppliers.filter((supplier) => supplier.active);
  const supplierLabel = (id: string) => overview.suppliers.find((supplier) => supplier.id === id)?.displayName ?? id;

  function run<T>(action: () => Promise<SupplierPortalActionResult<T>>, success: string, reset?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage({ ok: true, text: success });
        reset?.();
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-title text-fr-ink-900">Suppliers</h1>
        <p className="text-sm text-fr-ink-600">
          Create supplier accounts, link existing Farm Return sign-ins to them, and route real farmer requests to a supplier&apos;s RFQ inbox.
          Suppliers see product, quantity, delivery window and delivery area only — never the farmer&apos;s identity or contact details.{" "}
          <Link href="/operator/quotes" className="text-fr-green-700">
            Demand inbox
          </Link>
        </p>
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm text-fr-good" : "rounded-fr-control bg-fr-risk-bg px-3 py-2 text-sm text-fr-risk"}>
          {message.text}
        </p>
      ) : null}

      <Card className="flex flex-col gap-3">
        <CardHeader className="mb-0">
          <CardTitle>Route a request to a supplier</CardTitle>
        </CardHeader>
        {activeRequests.length === 0 || activeSuppliers.length === 0 ? (
          <p className="text-sm text-fr-ink-600">
            {activeRequests.length === 0 ? "No active farmer requests to route." : "Create a supplier first."}
          </p>
        ) : (
          <>
            <select aria-label="Farmer request" className={inputClass} value={routeRequest} onChange={(e) => setRouteRequest(e.target.value)}>
              <option value="">Choose a request…</option>
              {activeRequests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.label}
                </option>
              ))}
            </select>
            <select aria-label="Supplier to route to" className={inputClass} value={routeSupplier} onChange={(e) => setRouteSupplier(e.target.value)}>
              <option value="">Choose a supplier…</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${buttonClass} self-start`}
              disabled={pending || !routeRequest || !routeSupplier}
              onClick={() => run(() => routeQuoteRequestToSupplierAction({ requestId: routeRequest, supplierId: routeSupplier }), "Request routed to the supplier's inbox.", () => setRouteRequest(""))}
            >
              Route request
            </button>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardHeader className="mb-0">
          <CardTitle>Suppliers</CardTitle>
        </CardHeader>
        {overview.suppliers.length === 0 ? <p className="text-sm text-fr-ink-600">No suppliers yet.</p> : null}
        {overview.suppliers.map((supplier) => (
          <div key={supplier.id} className="rounded-fr-control border border-fr-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fr-ink-900">{supplier.displayName}</p>
              <Pill tone={supplier.active ? "good" : "neutral"}>{supplier.active ? "Active" : "Inactive"}</Pill>
            </div>
            <p className="text-xs text-fr-ink-600">
              {overview.routes.filter((route) => route.supplierId === supplier.id).length} routed request(s) ·{" "}
              {overview.routes.filter((route) => route.supplierId === supplier.id && route.liveQuoteStatus === "submitted").length} live submitted quote(s)
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {supplier.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-2 text-xs text-fr-ink-900">
                  <span>
                    {member.email ?? member.userId} · {member.role}
                    {member.active ? "" : " · revoked"}
                  </span>
                  {member.active ? (
                    <button
                      type="button"
                      className="text-fr-risk"
                      disabled={pending}
                      onClick={() => run(() => revokeSupplierMemberAction({ supplierId: supplier.id, userId: member.userId }), "Access revoked.")}
                    >
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="grid gap-2 border-t border-fr-border pt-3 sm:grid-cols-[1fr_1fr_auto]">
          <input aria-label="New supplier name" placeholder="Supplier name" className={inputClass} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          <input aria-label="New supplier email (optional)" placeholder="Contact email (optional)" className={inputClass} value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} />
          <button
            type="button"
            className={buttonClass}
            disabled={pending || supplierName.trim() === ""}
            onClick={() =>
              run(() => createSupplierAction({ displayName: supplierName, contactEmail: supplierEmail.trim() === "" ? null : supplierEmail }), "Supplier created.", () => {
                setSupplierName("");
                setSupplierEmail("");
              })
            }
          >
            Create supplier
          </button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardHeader className="mb-0">
          <CardTitle>Give an account supplier access</CardTitle>
        </CardHeader>
        <p className="text-xs text-fr-ink-600">The person must already have signed up to Farm Return. No invitation email is sent.</p>
        <select aria-label="Supplier for access" className={inputClass} value={memberSupplier} onChange={(e) => setMemberSupplier(e.target.value)}>
          <option value="">Choose a supplier…</option>
          {activeSuppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.displayName}
            </option>
          ))}
        </select>
        <input aria-label="Account email" placeholder="Their Farm Return sign-in email" className={inputClass} value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
        <select aria-label="Role" className={inputClass} value={memberRole} onChange={(e) => setMemberRole(e.target.value as "admin" | "member")}>
          <option value="admin">Admin (can change supplier settings)</option>
          <option value="member">Member</option>
        </select>
        <button
          type="button"
          className={`${buttonClass} self-start`}
          disabled={pending || !memberSupplier || memberEmail.trim() === ""}
          onClick={() => run(() => grantSupplierMemberAction({ supplierId: memberSupplier, userEmail: memberEmail, role: memberRole }), `Access granted for ${supplierLabel(memberSupplier)}.`, () => setMemberEmail(""))}
        >
          Grant access
        </button>
      </Card>
    </div>
  );
}
