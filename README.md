# Ryoku-Do Team Payments

Private-link registration and payment portal for the Ryoku-Do team.

## Architecture
- Static Parent/Admin UI: GitHub Pages.
- Versioned payment backend source: `supabase/functions/`.
- Versioned database changes: `supabase/migrations/`.
- Authentication, invitations, consents, audit and payment state: Supabase.
- Card entry and recurring billing: Invoice4U only. Full card data is never stored by Ryoku-Do.
- Invoice4U initial-payment integration: IPN endpoint in Supabase.
- Provider events are idempotent, audited and matched conservatively.

## Release process
1. Changes should be reviewed through a pull request when practical.
2. GitHub Actions validates required pages and JavaScript syntax.
3. Only the `main` branch deploys to GitHub Pages.
4. After backend/schema changes, run Supabase Security and Performance Advisors and a focused smoke test.
5. Backend source and migrations may be public, but secrets must never be committed. Never add service-role keys, IPN secrets, parent invitation tokens, card data or production credentials to this repository.
6. Follow `OPERATIONS.md` for release, monitoring and recovery procedures.

## Production checklist
- Admin login succeeds.
- Parent token opens only the intended request.
- Phone verification works and is rate-limited.
- Consent submission validates ID/email/DOB server-side.
- Invoice4U checkout hostname is restricted.
- IPN is configured and tested.
- Terms version/hash is recorded.
- No QA records or temporary provider secrets remain.
