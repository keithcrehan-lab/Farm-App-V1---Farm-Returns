import type { Prompt } from "@/orchestration/prompt";
import { fieldWorkspaceHref } from "@/lib/farm-spatial-field-lens";

export interface FieldModeQuickAction {
  id: "workspace" | "grass" | "soil" | "nutrients";
  label: string;
  detail: string;
  href: string;
}

/** Where Grass reads a field from a link, so the field isn't chosen twice. */
export function grassRecordHref(fieldId: string): string {
  return `/grass?field=${encodeURIComponent(fieldId)}`;
}

/** Field Mode's actions for a confirmed field. Every one is an existing
 * production route that owns its own workflow; Field Mode only gets the
 * farmer there with the field already known. */
export function fieldModeQuickActions(fieldId: string): FieldModeQuickAction[] {
  return [
    { id: "workspace", label: "Open field workspace", detail: "Overview, nutrients and history", href: fieldWorkspaceHref(fieldId) },
    { id: "grass", label: "Record grass", detail: "This field is already chosen", href: grassRecordHref(fieldId) },
    { id: "soil", label: "Start or review soil sampling", detail: "Guided GPS sampling", href: `/soil-sample/${encodeURIComponent(fieldId)}` },
    { id: "nutrients", label: "Open nutrient and fertiliser work", detail: "This field's Nutrients chapter", href: fieldWorkspaceHref(fieldId, "nutrients") },
  ];
}

/** A prompt is only offered as an action when it has a real basis. A prompt
 * that is blocked on evidence still shows on the field's own workspace. */
export function fieldModeActionablePrompt(prompt: Prompt | undefined): Prompt | undefined {
  return prompt?.basis.status === "OK" ? prompt : undefined;
}
