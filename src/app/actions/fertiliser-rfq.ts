"use server";

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import {
  fertiliserQuoteRequestIssues,
  renderFertiliserQuoteRequestText,
  type FertiliserQuoteRequest,
} from "@/domain/fertiliser-quote-request";
import {
  brevoTestTransportBlockReason,
  brevoTestTransportConfigFromEnv,
  fertiliserRfqEmailIdempotencyKey,
  getFertiliserRfqEmailTransport,
} from "@/lib/email/brevo-test-transport";

export type FertiliserRfqEmailCapability =
  | { configured: true }
  | { configured: false; reason: string };

export async function getFertiliserRfqEmailCapabilityAction(): Promise<FertiliserRfqEmailCapability> {
  const reason = brevoTestTransportBlockReason(brevoTestTransportConfigFromEnv());
  return reason ? { configured: false, reason } : { configured: true };
}

export type SendFertiliserRfqEmailResult =
  | {
      ok: true;
      attemptedAt: string;
      recipientName: string;
      providerReference: string;
      deliveryMode: "TEST_LOCKED";
    }
  | {
      ok: false;
      status: "blocked" | "failed";
      message: string;
      attemptedAt?: string;
      recipientName?: string;
    };

export async function sendFertiliserRfqEmailAction(request: FertiliserQuoteRequest): Promise<SendFertiliserRfqEmailResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, status: "blocked", message: "No signed-in farm is available for this quote request." };
  if (request.farmId !== farm.id) return { ok: false, status: "blocked", message: "This quote request does not belong to the signed-in farm." };
  if (request.status !== "READY_TO_SEND" && request.status !== "FAILED") {
    return { ok: false, status: "blocked", message: "Review and prepare the quote request before sending it." };
  }

  const issues = fertiliserQuoteRequestIssues(request);
  if (issues.length > 0) {
    return { ok: false, status: "blocked", message: "The quote request is incomplete and cannot be sent." };
  }
  if (request.details.recipients.length !== 1) {
    return {
      ok: false,
      status: "blocked",
      message: "The prototype sends one supplier request at a time. Choose exactly one supplier.",
    };
  }

  const recipient = request.details.recipients[0];
  const text = renderFertiliserQuoteRequestText(request);
  const transport = getFertiliserRfqEmailTransport();
  const result = await transport.send({
    to: recipient.contact ?? "",
    toName: recipient.name,
    subject: `Farm Return fertiliser quote request · ${request.requestId}`,
    text,
    idempotencyKey: fertiliserRfqEmailIdempotencyKey(request.requestId, recipient.name),
  });

  if (result.status === "blocked") return { ok: false, status: "blocked", message: result.reason };
  const attemptedAt = new Date().toISOString();
  if (result.status === "failed") {
    return { ok: false, status: "failed", message: result.error, attemptedAt, recipientName: recipient.name };
  }

  return {
    ok: true,
    attemptedAt,
    recipientName: recipient.name,
    providerReference: result.providerMessageId,
    deliveryMode: "TEST_LOCKED",
  };
}
