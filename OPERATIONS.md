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
- The public legacy IPN URL captures valid unsigned payloads without changing financial state. Only the stable authenticated path can process mapped setup/monthly outcomes.
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
6. Copy the stable secure callback URL from the MFA-protected Admin integration panel, and configure it for the sales-page IPN and existing mandates' monthly notifications. Restoring a new Vault secret requires updating provider destinations; prefer restoring the original encrypted configuration.
7. Deploy GitHub Pages.
8. Run the smoke tests above before reopening invitations.

## External controls not enforceable by repository code
These controls live in provider administration and must be enabled there:
- Supabase **Leaked Password Protection**.
- GitHub **branch protection/ruleset** on `main` requiring the validation workflow before merge.
- Invoice4U notification destination configuration and verification of the first ordinary authenticated callback. Do not create another mandate or a financial test charge.

## Live hotfixes

### 2026-10-06 — Payment-pending expiry semantics
Production maintenance was adjusted so link expiry only changes requests in `draft`, `sent`, `opened`, or `form_completed` to `expired`. Requests already in `payment_pending` are no longer marked expired merely because the private link expired. This prevents a completed registration / possibly-paid Invoice4U checkout from being mislabeled while provider verification is still manual.

### 2026-10-08 — First live sales-page IPN matching

- A payer may enter a different email on the Invoice4U sales page. Fallback association requires exactly one eligible request for the phone, a payment-pending checkout in the last 30 minutes, identical monthly amount and cycle count, and no eligible request for the payment email. Shared-phone and conflicting-email cases remain unlinked.
- A linked capture remains unverified and does not activate billing or mark a charge successful. The observed sales-page callback lacks a standing-order ID and explicit charge-success result. Store its clearing confirmation as informational metadata, never as a recurring-order ID or proof of a debit.
- Opaque `jsonParamsBase64`, payer identifiers and card metadata are redacted before storage. Plan amount, cycle count and the first-charge amount field are captured separately from a confirmed transaction amount.
- Existing capture association repairs are audited; financial request state is unchanged.

Before manually confirming a standing order, verify its status, monthly amount, cycle count, first-charge amount and charge dates in Invoice4U. Then update the request through Admin → Payment status. A sales-page return or an unsigned IPN alone is insufficient. Do not send the parent through a second payment setup to resolve a status-only mismatch.

### 2026-10-08 — Authenticated standing-order synchronization

The backend now supports sales-page setup notifications, API setup `Data=<JSON>` notifications, and monthly raw Base64 UTF-8 JSON notifications. Monthly Base64 is decoded **before** form parsing, even when Invoice4U labels the body `application/x-www-form-urlencoded`. Invoice4U's `paymentsNum` monthly field is not used for the number of cycles.

Invoice4U does not sign notifications and drops query strings on monthly callbacks. Admin → Invoice4U integration now exposes a **stable secret path URL**, with its random value encrypted in Supabase Vault and only its hash used for authentication. It is visible/copyable only after an approved administrator authenticates with MFA. Do not put this URL in source control, tickets, parent links, screenshots, public logs, or a URL shortener. The optional Zapier key has a separate purpose; rotating it does not expire the provider callback URL.

Provider configuration still has to be completed in the authenticated Invoice4U account:

1. Copy the secure notification URL from Admin → Invoice4U integration.
2. Replace the sales-page IPN destination with that URL.
3. Verify and update the monthly callback destination for **existing** standing orders as well. A sales-page change alone may apply only to future registrations. Invoice4U's API uses `StandingOrderCallBackUrl`; UPay uses `CallBackUrl` for monthly delivery. Preserve the exact path; no query key is required.
4. Keep the existing amount, dates, card token and cycle count unchanged. Do not create a second order or a test financial charge to verify notification routing.
5. After an actual provider notification, check the integration panel's last **authenticated** notification time, the mapped child, and its monthly result. A generated URL or a successful login alone does not prove provider configuration or delivery.

The public legacy IPN URL remains capture-only. Neither an unsigned success flag nor a parent return page changes financial status. The existing two manually confirmed mandates have approved payer aliases and their provider schedule, without altering the registered guardian or fabricating a debit. A first authenticated monthly notification can associate their provider standing-order IDs through those aliases. Admin → recent events → Link payer can resolve a different payer or ambiguous family after a provider check; linking an unsigned event alone does not mark it paid.

Authenticated delivery is persisted before mapping. A service-only, invoker RPC locks the event and request, enforces forms/consents and plan matching, and commits request status, ledger result, audit and alerts in one transaction. The unique `(standing_order_id, Israel receipt date)` key prevents repeated delivery being counted twice; a conflicting result requires review. An older received-date result cannot overwrite the latest result. No network call or financial instruction occurs in this transaction. A five-minute local retry job recovers transient processing failures because Invoice4U sends callbacks once and does not retry them.

Mandate state, monthly charge outcome and document outcome are separate. A failed monthly charge leaves the mandate active; a successful charge with document failure remains successful and raises a document alert. Setup confirms a mandate, never an actual debit. Invoice4U reports the normal monthly `sum`, not necessarily an overridden first debit amount, so the UI explicitly labels the plan amount and leaves actual debit amount unknown. Callback receipt date in Israel is used because the monthly payload lacks a transaction ID and charge timestamp.

Cancellation and modification of a real mandate remain provider-admin operations: the public Invoice4U API does not expose mandate history, update or cancellation, and these monthly callbacks do not report cancellation. Confirm external cancellations through the existing admin status workflow. An active callback never clears a pending local cancellation or reopens a provider-confirmed closed mandate.

Verification: `node --test tests/*.test.mjs` covers parsing, credential validation, unsigned forgery, durable queuing and replay. `tests/invoice4u-sync.test.sql` checks financial updates, duplicate/conflicting notifications, document failures, chronology, form guards, amount/currency mismatch, schedule, payer aliases and privileges inside a transaction that is completely rolled back. These tests do not contact Invoice4U or create a financial operation.

