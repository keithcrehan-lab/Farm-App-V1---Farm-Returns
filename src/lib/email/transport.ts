export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export type EmailSendResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; error: string }
  | { status: "blocked"; reason: string };

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
