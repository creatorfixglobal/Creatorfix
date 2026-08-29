import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Public-safe provider shape. Deliberately excludes `payout_method` and
 * any other private financial data — those fields don't exist on this
 * type, so customer-facing and public code paths can't leak them even
 * by accident.
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

export async function getProviderPublicDTO(
  providerProfileId: string
): Promise<ProviderPublicDTO | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("provider_public_view")
    .select(
      "id, user_id, username, display_name, avatar_url, bio, skills, verification_status, rating_average, rating_count, completed_orders, response_rate"
    )
    .eq("id", providerProfileId)
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
    ratingAverage: Number(data.rating_average),
    ratingCount: data.rating_count,
    completedOrders: data.completed_orders,
    responseRate: data.response_rate === null ? null : Number(data.response_rate),
  };
}

export async function getProviderPublicDTOByUsername(
  username: string
): Promise<ProviderPublicDTO | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("provider_public_view")
    .select(
      "id, user_id, username, display_name, avatar_url, bio, skills, verification_status, rating_average, rating_count, completed_orders, response_rate"
    )
    .eq("username", username)
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
    ratingAverage: Number(data.rating_average),
    ratingCount: data.rating_count,
    completedOrders: data.completed_orders,
    responseRate: data.response_rate === null ? null : Number(data.response_rate),
  };
}
