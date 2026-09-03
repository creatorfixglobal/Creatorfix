import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { MAX_VERIFICATION_FILE_BYTES } from "@/lib/validation/identity.schema";

function sniffImageExtension(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return null;
}

const ALLOWED_SLOTS = ["nid-front", "nid-back", "live-face"] as const;
type Slot = (typeof ALLOWED_SLOTS)[number];

export async function POST(request: NextRequest) {
  try {
    // API routes must return JSON, not a Next.js redirect document. This prevents
    // client-side JSON parsing failures such as "Unexpected token '<'".
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", error: "Please log in before uploading identity documents." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile || !["customer", "provider"].includes(profile.role)) {
      return NextResponse.json(
        { ok: false, code: "PROFILE_INVALID", error: "Your account is not eligible to upload identity documents." },
        { status: 403 }
      );
    }

    if (profile.status === "suspended" || profile.status === "banned") {
      return NextResponse.json(
        { ok: false, code: "ACCOUNT_RESTRICTED", error: "This account cannot upload identity documents." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const slot = formData.get("slot");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    if (typeof slot !== "string" || !ALLOWED_SLOTS.includes(slot as Slot)) {
      return NextResponse.json({ ok: false, error: "Invalid verification slot" }, { status: 400 });
    }

    if (file.size > MAX_VERIFICATION_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "File too large (max 8 MB)" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = sniffImageExtension(bytes);

    if (!ext) {
      return NextResponse.json(
        { ok: false, error: "File is not a valid JPEG, PNG, or WEBP image" },
        { status: 400 }
      );
    }

    const verificationBatchId = crypto.randomUUID();
    const path = `${profile.id}/${verificationBatchId}/${slot}.${ext}`;
    const admin = createAdminSupabaseClient();

    const { error: uploadError } = await admin.storage
      .from("identity-verification")
      .upload(path, bytes, {
        contentType: ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: "Upload failed: " + uploadError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, path });
  } catch (error) {
    console.error("Identity upload failed", error);
    return NextResponse.json(
      { ok: false, error: "The identity upload service is temporarily unavailable." },
      { status: 500 }
    );
  }
}
