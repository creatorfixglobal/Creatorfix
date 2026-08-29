import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { MAX_VERIFICATION_FILE_BYTES } from "@/lib/validation/identity.schema";

/**
 * Sniffs the actual image format from file bytes (magic numbers) —
 * NEVER trusts the browser-supplied File.type, which is trivially
 * spoofable (a renamed .php served as "image/jpeg"). Returns the real
 * extension, or null if the bytes don't match an allowed image format.
 */
function sniffImageExtension(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "webp";

  return null;
}

const ALLOWED_SLOTS = ["nid-front", "nid-back", "live-face"] as const;
type Slot = (typeof ALLOWED_SLOTS)[number];

export async function POST(request: NextRequest) {
  // Any authenticated customer or provider may upload their own
  // verification evidence — role/ownership of the resulting path is
  // enforced below, not by who's allowed to hit this route at all.
  const profile = await requireRole(["customer", "provider"]);

  const formData = await request.formData();
  const file = formData.get("file");
  const slot = formData.get("slot");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  }
  if (typeof slot !== "string" || !ALLOWED_SLOTS.includes(slot as Slot)) {
    return NextResponse.json({ ok: false, error: "Invalid slot" }, { status: 400 });
  }

  if (file.size > MAX_VERIFICATION_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File too large (max 8 MB)" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const ext = sniffImageExtension(bytes);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "File is not a valid JPEG, PNG, or WEBP image" },
      { status: 400 }
    );
  }

  // Path is scoped under the CALLER's own profile id, server-derived —
  // never taken from the request. This is what the storage bucket's own
  // RLS-equivalent path policy also enforces; this route enforces it a
  // second time before ever calling Storage.
  const verificationBatchId = crypto.randomUUID();
  const path = `${profile.id}/${verificationBatchId}/${slot}.${ext}`;

  const admin = createAdminSupabaseClient();
  const { error: uploadError } = await admin.storage
    .from("identity-verification")
    .upload(path, bytes, {
      contentType:
        ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { ok: false, error: "Upload failed: " + uploadError.message },
      { status: 500 }
    );
  }

  // Return only the PATH, never a public URL — the client stores this
  // path and sends it back on submitVerificationAction; actual viewing
  // always goes through a freshly-minted signed URL, never this path
  // used directly.
  return NextResponse.json({ ok: true, path });
}