# Open-mat future-start validation — prepared, not applied

The database update is pending. The active `register_open_mat` function was checked after the apply attempt was interrupted and still has no future-start guard.

Migration: `supabase/migrations/20261009173434_open_mat_future_start.sql`
Verification after applying: `tests/open-mat-future-start.test.sql`

The change rejects only a new request whose requested start is at or before the current instant in Asia/Jerusalem. Existing request-key replay is checked first, so a lost-response retry can still retrieve its saved result. Payment status, entry approval and notification queue behavior are unchanged.

The time-comparison expression passed six read-only checks for summer time, winter time and Israel midnight. The complete migration and replay checks still require application and verification.

The verification transaction rolls back its synthetic row and never sends or marks an email sent. Do not mark the migration complete until Supabase returns success and the verification passes.
