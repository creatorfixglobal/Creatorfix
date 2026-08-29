import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Role = "customer" | "provider" | "admin";

export type AuthenticatedProfile = {
  id: string;
  authUserId: string;
  role: Role;
  status: "active" | "suspended" | "banned" | "pending";
  displayName: string;
  username: string;
};

/**
 * Re-derives the caller's identity and role from the current Supabase
 * session on every call. The role is NEVER read from a client-supplied
 * parameter, header, or cookie value we set ourselves — only from the
 * `profiles` row that RLS lets the session's own user select.
 *
 * Usage in a Server Action:
 *   const profile = await requireRole(["provider"]);
 *   // profile.id is now trustworthy for authorization decisions
 */
export async function requireRole(
  allowedRoles: Role[]
): Promise<AuthenticatedProfile> {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, auth_user_id, role, status, display_name, username")
    .eq("auth_user_id", user!.id)
    .single();

  if (profileError || !profile) {
    // Auth succeeded but no profile row exists — treat as unauthenticated.
    redirect("/login");
  }

  if (profile!.status !== "active") {
    redirect("/account-suspended");
  }

  if (!allowedRoles.includes(profile!.role as Role)) {
    redirect("/unauthorized");
  }

  return {
    id: profile!.id,
    authUserId: profile!.auth_user_id,
    role: profile!.role as Role,
    status: profile!.status,
    displayName: profile!.display_name,
    username: profile!.username,
  };
}

/**
 * Like requireRole, but returns null instead of redirecting — for pages
 * that render differently for logged-out vs logged-in users rather than
 * gating access entirely.
 */
export async function getOptionalProfile(): Promise<AuthenticatedProfile | null> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, auth_user_id, role, status, display_name, username")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    authUserId: profile.auth_user_id,
    role: profile.role as Role,
    status: profile.status,
    displayName: profile.display_name,
    username: profile.username,
  };
}
