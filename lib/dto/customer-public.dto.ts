import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The ONLY shape of customer data a provider (or any provider-facing
 * code path) is ever allowed to see. There is no `phone`, `whatsapp_number`,
 * `email`, or `address` field on this type — that is the enforcement
 * mechanism. A future engineer trying to add one of those fields here
 * would have to do so explicitly and visibly, not by an incidental
 * `select *`.
 */
export type CustomerPublicDTO = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

/**
 * Fetches a customer's public-safe info by profile id, for use in any
 * provider-facing context (order detail, order list, messaging header).
 * Reads from `customer_public_view`, which itself has no contact columns
 * — so even a bug in this function's select list can't leak a field
 * that doesn't exist in the underlying view.
 */
export async function getCustomerPublicDTO(
  profileId: string
): Promise<CustomerPublicDTO | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("customer_public_view")
    .select("id, display_name, avatar_url")
    .eq("id", profileId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
  };
}