"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  registerSchema,
  loginSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
} from "@/lib/validation/auth.schema";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://creatorfix-git.vercel.app").replace(/\/$/, "");
}

export async function registerAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Please check the information you entered.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { email, password, username, displayName } = parsed.data;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl()}/login`,
        data: { username, display_name: displayName },
      },
    });

    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: "Registration could not create a user. Please try again." };

    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Registration service is temporarily unavailable." };
  }
}

export async function loginAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Please enter a valid email and password." };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Login service unavailable." };
  }
}

export async function logoutAction(): Promise<ActionResult> {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();
    return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Logout failed." };
  }
}

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = resetPasswordRequestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid email address." };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${appUrl()}/reset-password/confirm`,
    });

    return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Password reset service unavailable." };
  }
}

export async function confirmPasswordResetAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = resetPasswordConfirmSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid password." };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Password update failed." };
  }
}
