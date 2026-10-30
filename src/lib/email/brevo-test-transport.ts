import "server-only";

import { createHash } from "node:crypto";
import type { EmailMessage, EmailSendResult, EmailTransport } from "./transport";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoTestTransportConfig {
  mode: string | undefined;
  apiKey: string | undefined;
  fromEmail: string | undefined;
  fromName: string | undefined;
  testRecipient: string | undefined;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function brevoTestTransportConfigFromEnv(): BrevoTestTransportConfig {
  return {
    mode: process.env.FERTILISER_RFQ_EMAIL_MODE,
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.FERTILISER_RFQ_FROM_EMAIL,
    fromName: process.env.FERTILISER_RFQ_FROM_NAME,
    testRecipient: process.env.FERTILISER_RFQ_TEST_RECIPIENT,
  };
}

export function brevoTestTransportBlockReason(config: BrevoTestTransportConfig): string | null {
  if (clean(config.mode) !== "test_locked") {
    return "Prototype email delivery is disabled. Set FERTILISER_RFQ_EMAIL_MODE=test_locked to enable it.";
  }
  if (!clean(config.apiKey)) return "Brevo API key is not configured.";
  if (!clean(config.fromEmail)) return "A verified Brevo sender email is not configured.";
  if (!clean(config.testRecipient)) return "The prototype test-recipient email is not configured.";
  return null;
}

/**
 * Stable UUID-shaped key derived from the RFQ + intended supplier.
 * Brevo accepts an idempotencyKey header in the transactional-email body;
 * using a stable key makes a retry of the same supplier dispatch non-duplicating
 * within Brevo's idempotency window.
 */
export function fertiliserRfqEmailIdempotencyKey(requestId: string, recipientName: string): string {
  const hex = createHash("sha256").update(`${requestId}\u0000${recipientName}`, "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export class BrevoTestLockedEmailTransport implements EmailTransport {
  constructor(
    private readonly config: BrevoTestTransportConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const blocked = brevoTestTransportBlockReason(this.config);
    if (blocked) return { status: "blocked", reason: blocked };

    const apiKey = clean(this.config.apiKey) as string;
    const fromEmail = clean(this.config.fromEmail) as string;
    const testRecipient = clean(this.config.testRecipient) as string;
    const fromName = clean(this.config.fromName) ?? "Farm Return";

    let response: Response;
    try {
      response = await this.fetchImpl(BREVO_SEND_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: testRecipient, name: message.toName ?? "Farm Return RFQ test" }],
          subject: message.subject,
          textContent: message.text,
          headers: { idempotencyKey: message.idempotencyKey },
          tags: ["farm-return", "fertiliser-rfq-prototype"],
        }),
      });
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : "Brevo request failed." };
    }

    const payload = (await response.json().catch(() => null)) as { messageId?: unknown; message?: unknown; code?: unknown } | null;
    if (!response.ok) {
      const detail =
        typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.code === "string"
            ? payload.code
            : `Brevo returned HTTP ${response.status}.`;
      return { status: "failed", error: detail };
    }

    if (typeof payload?.messageId !== "string" || payload.messageId.trim().length === 0) {
      return { status: "failed", error: "Brevo accepted the request but returned no message ID." };
    }

    return { status: "sent", providerMessageId: payload.messageId };
  }
}

export function getFertiliserRfqEmailTransport(): EmailTransport {
  return new BrevoTestLockedEmailTransport(brevoTestTransportConfigFromEnv());
}
