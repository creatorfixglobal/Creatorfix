-- CreatorFix — Column-level lockdown on profiles.role / profiles.status
--
-- RLS policies (0002) control which ROWS a user can UPDATE, not which
-- COLUMNS. The "own profile update" policy on `profiles` would, without
-- this migration, let an authenticated user PATCH their own `role` or
-- `status` column directly — e.g. flipping themselves to 'admin' or
-- clearing a 'suspended' status. Postgres column-level GRANT/REVOKE
-- closes this independently of RLS, as a second layer:

revoke update on profiles from authenticated;

grant update (
  username, display_name, phone, whatsapp_number, avatar_url, updated_at
) on profiles to authenticated;

-- role and status are deliberately excluded from the grant above.
-- role changes only ever happen via approve_provider_application()
-- (service_role, SECURITY DEFINER). status changes (suspend/ban) only
-- ever happen via admin actions using the service_role/admin client,
-- which is unaffected by this REVOKE since service_role bypasses
-- table-level grants entirely.

-- Same treatment for provider_profiles.verification_status and .status —
-- a provider should never be able to self-certify as verified.
revoke update on provider_profiles from authenticated;

grant update (
  bio, skills, payout_method, updated_at
) on provider_profiles to authenticated;
