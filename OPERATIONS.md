# Ryoku-Do Team Payments — Production Operations

## Security baseline
- Admin actions require a Supabase Auth session at **AAL2** (password + TOTP MFA).
- Parent links use random 256-bit tokens; raw tokens are not stored in the database.
- Parent details are shown only after phone verification.
- Direct `anon` / `authenticated` access to team-payment tables is revoked; server-side Edge Functions use the service role.
- Full card data is handled only by Invoice4U and is never stored in Ryoku-Do.
- Production secrets must never be committed to GitHub.

## One-time admin MFA enrollment
At the next admin login, if no verified TOTP factor exists:
1. Sign in with the admin email and password.
2. Scan the displayed QR with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.
3. Enter the 6-digit code.
4. The backend will accept admin API calls only after the session reaches `aal2`.

Supabase currently has no recovery-code feature for TOTP. Keep the TOTP factor/secret in an appropriately secured account/device.

## Release process
1. Make changes through a pull request when possible.
2. GitHub Actions validates required files, JavaScript syntax, CSP hardening, and common secret patterns.
3. Production GitHub Pages deploy happens only after the validation job succeeds.
4. After any database/backend change:
   - sync the production Edge Function source under `supabase/functions/`;
   - add the corresponding migration under `supabase/migrations/`;
   - run Supabase Security and Performance Advisors;
   - run the focused smoke tests below.

## Smoke tests
- Parent URL without a token shows no personal data.
- Valid parent token exposes only the masked phone until verification.
- Phone verification issues a short-lived one-time proof.
- Submit without proof is rejected.
- Admin API with AAL1 is rejected; AAL2 is accepted.
- Invoice4U checkout URL remains on the approved Invoice4U hostname.
- IPN capture returns 200 for a non-empty payload but does not change payment state until mapping/verification is approved.
- Two requests for the same parent are never guessed when matching is ambiguous.
- `team-payment-hourly-maintenance` has a recent successful run.
- No QA rows remain.

## Monitoring
The hourly maintenance job calls:
`private.team_payment_run_maintenance()`

It updates:
- `team_payment_system_health` — maintenance heartbeat/status.
- `team_payment_operational_alerts` — persistent alerts for:
  - stale payment-pending requests;
  - provider cancellation still required;
  - IPN awaiting mapping;
  - failed/unmatched provider events;
  - retention review.

The Admin “Action Center” reads these alerts and reports a stale heartbeat if maintenance has not run for approximately 2.5 hours.

## Retention
Raw provider payloads are cleared after 30 days while normalized event/audit data is retained.
Expired verification sessions and rate-limit rows are removed automatically.

Completed/cancelled registrations are **not automatically deleted**. After the configured retention-review interval (currently 24 months), an alert is created so personal/medical data can be reviewed for deletion, anonymization, or justified continued retention.

## Recovery / rebuild
Source of truth:
- Frontend: repository root HTML/JS/CSS.
- Edge Functions: `supabase/functions/`.
- Database changes: `supabase/migrations/`.
- Runtime configuration that must be re-established externally:
  - Supabase project secrets;
  - Invoice4U ProductGuid page and IPN URL;
  - Invoice4U external thank-you URL: `https://raphysitruk-eng.github.io/ryoku-do-team-payments/thank-you.html`;
  - Supabase Auth settings;
  - GitHub Pages configuration.

Recovery order:
1. Provision or restore Supabase.
2. Apply migrations in chronological order.
3. Deploy the three active payment Edge Functions from `supabase/functions/`.
4. Restore required Supabase secrets through the dashboard/secure secret manager — never from Git.
5. Verify the admin profile/role and Auth configuration.
6. Configure Invoice4U IPN to:
   `https://zwgpvwxdofjidshsiaek.supabase.co/functions/v1/team-payment-invoice4u-ipn`
7. Deploy GitHub Pages.
8. Run the smoke tests above before reopening invitations.

## External controls not enforceable by repository code
These controls live in provider administration and must be enabled there:
- Supabase **Leaked Password Protection**.
- GitHub **branch protection/ruleset** on `main` requiring the validation workflow before merge.
- A real Invoice4U transaction/IPN mapping test before automatic payment-state updates are enabled.
