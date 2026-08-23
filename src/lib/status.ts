import type { AlertSeverity, DataStatus } from "@/domain/types";

/**
 * Central status-colour semantics. Per design/design-system.md: green = good/
 * optimal/confirmed, amber = attention/marginal, red = blocked/risk, blue =
 * information/data/weather. Never repurpose these tokens for anything else.
 */
export type StatusTone = "good" | "attention" | "risk" | "info" | "neutral";

export const toneClasses: Record<StatusTone, { bg: string; text: string; ring?: string }> = {
  good: { bg: "bg-fr-good-bg", text: "text-fr-good" },
  attention: { bg: "bg-fr-attention-bg", text: "text-fr-attention" },
  risk: { bg: "bg-fr-risk-bg", text: "text-fr-risk" },
  info: { bg: "bg-fr-info-bg", text: "text-fr-info" },
  neutral: { bg: "bg-fr-surface-alt", text: "text-fr-ink-600" },
};

export function dataStatusTone(status: DataStatus): StatusTone {
  switch (status) {
    case "verified":
      return "good";
    case "farmer_adjusted":
      return "attention";
    case "estimated":
      return "neutral";
    case "mapped":
      return "info";
  }
}

export function dataStatusLabel(status: DataStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "farmer_adjusted":
      return "Farmer adjusted";
    case "estimated":
      return "Estimated";
    case "mapped":
      return "Mapped";
  }
}

export function alertSeverityTone(severity: AlertSeverity): StatusTone {
  switch (severity) {
    case "risk":
      return "risk";
    case "attention":
      return "attention";
    case "info":
      return "info";
  }
}

/** Spreading/soil-health style 0-100 score → status tone band. */
export function scoreTone(score: number): StatusTone {
  if (score <= 0) return "risk";
  if (score < 65) return "attention";
  return "good";
}

export function scoreBandLabel(score: number): string {
  if (score <= 0) return "Do not spread";
  if (score < 50) return "Marginal";
  if (score < 80) return "Good";
  return "Very good";
}
