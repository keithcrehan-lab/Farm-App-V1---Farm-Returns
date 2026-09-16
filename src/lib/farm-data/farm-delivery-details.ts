import "server-only";

/**
 * Managed Quote Pilot, Checkpoint 1 — reusable farm delivery details.
 *
 * `farm_delivery_details` (`20260911080000_quote_pilot_checkpoint1.sql`)
 * is a plain farmer-owned CRUD table, the same ownership pattern
 * `supplier-quotes.ts` already uses. This is the *reusable, editable*
 * copy — a request's own immutable delivery snapshot (taken at
 * submission/revision time by the `submit_quote_request`/
 * `revise_quote_request` RPCs) is separate and never rewritten by an
 * edit here (brief Q09).
 */
import { createClient } from "@/lib/supabase/server";

export interface FarmDeliveryDetails {
  farmId: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine1: string;
  addressLine2: string | null;
  townOrCity: string;
  county: string;
  eircode: string | null;
}

interface FarmDeliveryDetailsRow {
  farm_id: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  address_line1: string;
  address_line2: string | null;
  town_or_city: string;
  county: string;
  eircode: string | null;
}

function rowToFarmDeliveryDetails(row: FarmDeliveryDetailsRow): FarmDeliveryDetails {
  return {
    farmId: row.farm_id,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    townOrCity: row.town_or_city,
    county: row.county,
    eircode: row.eircode,
  };
}

export async function getFarmDeliveryDetails(farmId: string): Promise<FarmDeliveryDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("farm_delivery_details").select("*").eq("farm_id", farmId).maybeSingle();
  if (error) throw error;
  return data ? rowToFarmDeliveryDetails(data as FarmDeliveryDetailsRow) : null;
}

export interface FarmDeliveryDetailsInput {
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  addressLine1: string;
  addressLine2?: string;
  townOrCity: string;
  county: string;
  eircode?: string;
}

/** Validates a farm delivery details input — throws on any structural
 * violation, the same fail-closed convention every other narrow input
 * validator in this codebase uses. */
export function validateFarmDeliveryDetailsInput(input: unknown): FarmDeliveryDetailsInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("validateFarmDeliveryDetailsInput: expected an object");
  }
  const raw = input as Record<string, unknown>;

  const requireNonEmptyString = (key: string): string => {
    const value = raw[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`validateFarmDeliveryDetailsInput: ${key} must be a non-empty string`);
    }
    return value.trim();
  };

  const optionalNonEmptyString = (key: string): string | undefined => {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`validateFarmDeliveryDetailsInput: ${key}, if present, must be a non-empty string`);
    }
    return value.trim();
  };

  const result: FarmDeliveryDetailsInput = {
    contactName: requireNonEmptyString("contactName"),
    addressLine1: requireNonEmptyString("addressLine1"),
    townOrCity: requireNonEmptyString("townOrCity"),
    county: requireNonEmptyString("county"),
  };
  const contactPhone = optionalNonEmptyString("contactPhone");
  const contactEmail = optionalNonEmptyString("contactEmail");
  const addressLine2 = optionalNonEmptyString("addressLine2");
  const eircode = optionalNonEmptyString("eircode");
  if (contactPhone !== undefined) result.contactPhone = contactPhone;
  if (contactEmail !== undefined) result.contactEmail = contactEmail;
  if (addressLine2 !== undefined) result.addressLine2 = addressLine2;
  if (eircode !== undefined) result.eircode = eircode;
  return result;
}

export async function upsertFarmDeliveryDetails(farmId: string, input: FarmDeliveryDetailsInput): Promise<FarmDeliveryDetails> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("farm_delivery_details")
    .upsert(
      {
        farm_id: farmId,
        contact_name: input.contactName,
        contact_phone: input.contactPhone ?? null,
        contact_email: input.contactEmail ?? null,
        address_line1: input.addressLine1,
        address_line2: input.addressLine2 ?? null,
        town_or_city: input.townOrCity,
        county: input.county,
        eircode: input.eircode ?? null,
      },
      { onConflict: "farm_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return rowToFarmDeliveryDetails(data as FarmDeliveryDetailsRow);
}
