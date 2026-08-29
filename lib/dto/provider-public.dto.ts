import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The ONLY shape of provider data a customer (or any customer-facing
 * code path) is ever allowed to see. No `payout_method`, no `phone`,
 * no other private fields.
 */
export type ProviderPublicDTO = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  skills: string[];
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  ratingAverage: number;
  ratingCount: number;
  completedOrders: number;
  responseRate: number | null;
};

/**
 * Fetches a provider's public-safe info by profile id, for use in any
 * customer-facing context (browse providers, order context, reviews).
 * Reads from `provider_public_view`.
 */
export async function getProviderPublicDTO(
  providerId: string
): Promise<ProviderPublicDTO | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("provider_public_view")
    .select(
      "id, user_id, username, display_name, avatar_url, bio, skills, verification_status, rating_average, rating_count, completed_orders, response_rate"
    )
    .eq("id", providerId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    skills: data.skills ?? [],
    verificationStatus: data.verification_status,
    ratingAverage: data.rating_average,
    ratingCount: data.rating_count,
    completedOrders: data.completed_orders,
    responseRate: data.response_rate,
  };
}