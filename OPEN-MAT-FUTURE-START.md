# Open-mat future-start validation — applied and verified

Applied to Supabase project `zwgpvwxdofjidshsiaek` on 2026-10-10. Supabase returned success and migration history records `20261010070728_open_mat_future_start`.

Source migration: `supabase/migrations/20261009173434_open_mat_future_start.sql`
Verification: `tests/open-mat-future-start.test.sql`

New registrations are rejected when the requested start is at or before the current instant in Asia/Jerusalem. Request-key replay is checked first, allowing a lost-response retry to retrieve its previously saved result after the start time. Payment status, entry approval and notification queue behavior are preserved.

The complete verification transaction passed on the live database: summer/winter offsets, exact start, Israel midnight, rejection of a new past request, replay of a saved past request, no notification duplication, and server-only function privileges. All synthetic records were rolled back; no email was sent or marked sent.

A follow-up definition and privilege check confirmed the guard is active, the helper is available to `service_role`, and `register_open_mat` is not executable by `anon` or `authenticated`. Security advisors reported no new warning; the existing leaked-password protection warning remains. The account stays on Free at the owner's request; no upgrade or billing change was performed.

## bit payment link

The public registration site already accepts an official collection link through its server runtime `BIT_PAYMENT_URL`. No collection link for the open-mat recipient `0547501888` has been provided or configured. A direct collection link must be created in that recipient's bit app (group, 30 NIS, share/copy link). Until then, the existing transfer instructions and phone-copy control remain available. Do not substitute another recipient's QR or construct an undocumented payment URL. Payment reports continue to require Raphy's verification.
