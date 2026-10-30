import { describe, expect, it, vi } from "vitest";
import {
  BrevoTestLockedEmailTransport,
  brevoTestTransportBlockReason,
  fertiliserRfqEmailIdempotencyKey,
  type BrevoTestTransportConfig,
} from "./brevo-test-transport";

const CONFIG: BrevoTestTransportConfig = {
  mode: "test_locked",
  apiKey: "test-api-key",
  fromEmail: "verified@example.com",
  fromName: "Farm Return",
  testRecipient: "prototype-inbox@example.com",
};

describe("BrevoTestLockedEmailTransport", () => {
  it("fails closed until test-locked mode and every required setting are configured", () => {
    expect(brevoTestTransportBlockReason({ ...CONFIG, mode: undefined })).toMatch(/disabled/i);
    expect(brevoTestTransportBlockReason({ ...CONFIG, apiKey: undefined })).toMatch(/API key/i);
    expect(brevoTestTransportBlockReason({ ...CONFIG, fromEmail: undefined })).toMatch(/sender/i);
    expect(brevoTestTransportBlockReason({ ...CONFIG, testRecipient: undefined })).toMatch(/test-recipient/i);
    expect(brevoTestTransportBlockReason(CONFIG)).toBeNull();
  });

  it("always sends physically to the configured test inbox, never the supplier contact", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.to).toEqual([{ email: "prototype-inbox@example.com", name: "Agri Store" }]);
      expect(body.to[0].email).not.toBe("supplier@example.com");
      expect(body.sender).toEqual({ email: "verified@example.com", name: "Farm Return" });
      expect(body.textContent).toContain("Farm Return fertiliser quote request");
      expect(body.headers.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      return new Response(JSON.stringify({ messageId: "<provider-message-id>" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const transport = new BrevoTestLockedEmailTransport(CONFIG, fetchImpl as typeof fetch);
    const result = await transport.send({
      to: "supplier@example.com",
      toName: "Agri Store",
      subject: "Farm Return fertiliser quote request · req-1",
      text: "Farm Return fertiliser quote request\nReference: req-1",
      idempotencyKey: fertiliserRfqEmailIdempotencyKey("req-1", "Agri Store"),
    });

    expect(result).toEqual({ status: "sent", providerMessageId: "<provider-message-id>" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("derives the same idempotency key for an exact retry and a different key for another supplier", () => {
    const a = fertiliserRfqEmailIdempotencyKey("req-1", "Agri Store");
    expect(fertiliserRfqEmailIdempotencyKey("req-1", "Agri Store")).toBe(a);
    expect(fertiliserRfqEmailIdempotencyKey("req-1", "Other Supplier")).not.toBe(a);
  });
});
