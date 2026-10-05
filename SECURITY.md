# Security

This repository contains the public frontend plus version-controlled Supabase Edge Function source and database migrations for the Ryoku-Do team payment portal. The backend source intentionally contains no production credentials.

Do not commit:
- Supabase service-role or secret keys
- Invoice4U/IPN secrets
- Parent invitation tokens
- Personal data exported from the database
- Full payment-card data
- Production webhook payloads containing personal information

The frontend may contain the Supabase publishable key by design. Authorization for sensitive operations is enforced in Supabase Edge Functions and server-side database rules.

Backend logic may be versioned here only when it contains no credentials. Production secrets, private keys, raw parent data and provider credentials must never be added to this public repository.

If a credential or personal record is committed accidentally, rotate/revoke the credential immediately and remove the exposed data from production history where appropriate.
