# Production recovery runbook

This repository contains only the public static frontend. Production secrets and Supabase service-role credentials must never be committed here.

## Release policy

Production GitHub Pages deployment is allowed only for a commit associated with a merged pull request. Direct pushes to `main` may update Git history but the workflow intentionally blocks their production deployment.

Recommended workflow:

1. Create a branch from current `main`.
2. Make and review changes on the branch.
3. Open a pull request.
4. Wait for the validation workflow to pass.
5. Merge the pull request.
6. Confirm the post-merge validation and Pages deployment are successful.

## Supabase baseline

The private recovery bundle for the team-payment backend is stored outside this public repository. It contains:

- current team-payment database schema baseline
- indexes, grants and RLS posture
- atomic consent RPC
- hourly maintenance Cron definition
- active Edge Function source for the payment API, provider hook, Invoice4U IPN capture and retired portal redirect
- production configuration manifest without secrets or parent data

Never put that private bundle, service-role keys, parent invitation tokens, IPN secrets, ID numbers, health data or provider payloads in this public repository.

## Admin security

Administrative API actions require:

- an approved `profiles.role = 'admin'` account
- a valid Supabase Auth session
- TOTP MFA
- an `aal2` access token

The backend rejects administrative requests that are only `aal1`.

If the administrator loses the authenticator device, use Supabase Dashboard recovery procedures to remove/re-enroll the verified factor after independently verifying account ownership. Do not disable the backend AAL2 requirement as a shortcut.

## Recovery order

1. Restore or create the Supabase project.
2. Apply the private team-payment schema baseline.
3. Recreate the team-payment settings and terms hash.
4. Deploy the four Edge Functions from the private recovery bundle.
5. Configure required Supabase secrets in the platform; never hard-code them.
6. Recreate the hourly maintenance job.
7. Verify RLS and confirm `anon` / `authenticated` have no direct privileges on team-payment tables.
8. Create/approve the admin profile and enroll TOTP MFA.
9. Configure the Invoice4U IPN URL.
10. Run Security and Performance Advisors.
11. Run a parent-flow smoke test before sending real invitations.

## Payment safety

The Invoice4U sales-page IPN remains capture-only until the provider's real payload mapping and verification method have been confirmed from a genuine transaction. A static thank-you page is never considered payment proof.
