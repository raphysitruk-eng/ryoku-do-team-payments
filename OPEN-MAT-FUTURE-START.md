# Open-mat future-start validation — applied and verified

Applied to Supabase project `zwgpvwxdofjidshsiaek` on 2026-10-10. Supabase returned success and migration history records `20261010070728_open_mat_future_start`.

Source migration: `supabase/migrations/20261009173434_open_mat_future_start.sql`
Verification: `tests/open-mat-future-start.test.sql`

New registrations are rejected when the requested start is at or before the current instant in Asia/Jerusalem. Request-key replay is checked first, allowing a lost-response retry to retrieve its previously saved result after the start time. Payment status, entry approval and notification queue behavior are preserved.

The complete verification transaction passed on the live database: summer/winter offsets, exact start, Israel midnight, rejection of a new past request, replay of a saved past request, no notification duplication, and server-only function privileges. All synthetic records were rolled back; no email was sent or marked sent.

A follow-up definition and privilege check confirmed the guard is active, the helper is available to `service_role`, and `register_open_mat` is not executable by `anon` or `authenticated`. Security advisors reported no new warning; the existing leaked-password protection warning remains. The account stays on Free at the owner's request; no upgrade or billing change was performed.

## bit payment link

On 2026-10-10 the owner provided this bit collection link for "מזרון פתוח":
https://www.bitpay.co.il/app/share-info?i=7SBBRJh_&j=true

The owner's bit request states a payment of 30 NIS to Raphy Sitruk and a collection deadline of 2027-10-09. The exact official HTTPS link is configured as non-secret server runtime `BIT_PAYMENT_URL` on Site `appgprj_6ac8bb82315081919ceae63a789123bf`. All other runtime keys were preserved.

Production deployment `appgdep_6ac9e685090c81919ef622fa22f25da1` succeeded with environment revision 2 and existing saved version 4 (`e9787df2367f8c21e80914bef6dcb043a7a481c2`). The registration form already reads this runtime setting and displays its "לתשלום ב-bit" link after a successful registration. No payment was executed or automatically verified. Payment reports and hall entry still require Raphy's verification/approval.

The owner should replace the collection link when the group closes or before the stated collection deadline. No account upgrade or billing change was performed.
