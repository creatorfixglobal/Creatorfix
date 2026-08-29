import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UserRole = "customer" | "provider" | "admin";

export interface AuthenticatedProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: string;
}

/**
 * Server-side role gate: verifies the current session's user exists,
 * has a profiles row, and matches one of the allowed roles. Throws
 * redirect() if not authenticated or not authorized for the given role(s).
 *
 * This runs on every Server Action and Server Component that needs
 * role-based access control. Role is re-derived from the database
 * on every call, never cached or trusted from the client.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthenticatedProfile> {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, status")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  if (!allowedRoles.includes(profile.role as UserRole)) {
    redirect("/unauthorized");
  }

  if (profile.status === "suspended" || profile.status === "banned") {
    redirect("/account-suspended");
  }

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role as UserRole,
    status: profile.status,
  };
}