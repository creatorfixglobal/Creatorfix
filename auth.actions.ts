"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  registerSchema,
  loginSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
} from "@/lib/validation/auth.schema";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Registers a new user via Supabase Auth, then creates the corresponding
 * `profiles` row using the ADMIN client. The profile row is never
 * inserted by the client directly — role, id linkage, and defaults are
 * all set server-side, so a client can't register itself as 'admin' or
 * spoof another user's auth_user_id.
 */
export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { email, password, username, displayName } = parsed.data;

  const supabase = createServerSupabaseClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
    },
  });

  if (signUpError || !signUpData.user) {
    return { ok: false, error: signUpError?.message ?? "Registration failed" };
  }

  // Use the admin client so RLS (which requires an existing profiles row
  // to resolve current_profile_id()) doesn't block the very first insert.
  const admin = createAdminSupabaseClient();

  const { error: profileError } = await admin.from("profiles").insert({
    auth_user_id: signUpData.user.id,
    role: "customer", // ALWAYS 'customer'. There is no request field that
    // can change this — becoming a provider requires a separate,
    // identity-verification-gated application reviewed by an admin
    // (see db/migrations/0004_provider_onboarding.sql).
    username,
    display_name: displayName,
    email,
    status: "active",
  });

  if (profileError) {
    return { ok: false, error: "Could not create profile: " + profileError.message };
  }

  // Ensure a wallet exists for every user (customer deposits into it,
  // provider earnings land in it) — created server-side, balance starts at 0.
  const { data: newProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", signUpData.user.id)
    .single();

  if (newProfile) {
    await admin.from("wallets").insert({ user_id: newProfile.id, balance: 0 });
    // No provider_profiles row is created here. Every account starts as
    // 'customer'; a provider_profiles row is only ever created by
    // approve_provider_application() once an identity-verified customer's
    // provider application is approved.
  }

  return { ok: true, data: undefined };
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: "Incorrect email or password" };
  }

  // Best-effort last_login_at update — never blocks login on failure.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("auth_user_id", user.id);
  }

  return { ok: true, data: undefined };
}

export async function logoutAction(): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function requestPasswordResetAction(
  input: unknown
): Promise<ActionResult> {
  const parsed = resetPasswordRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/confirm`,
  });

  // Always return success even on error, to avoid leaking whether an
  // email address is registered (a common enumeration vector).
  void error;
  return { ok: true, data: undefined };
}

export async function confirmPasswordResetAction(
  input: unknown
): Promise<ActionResult> {
  const parsed = resetPasswordConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}
