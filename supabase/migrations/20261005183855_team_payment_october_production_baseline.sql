-- Idempotent production baseline for October 2026 hardening.
-- This migration records the schema delta that had previously existed only in production.

alter table public.team_payment_requests
  add column if not exists provider_last_event_id text,
  add column if not exists provider_last_synced_at timestamptz,
  add column if not exists provider_sync_source text,
  add column if not exists child_id uuid references public.children(id) on delete set null,
  add column if not exists parent_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists parent_phone_normalized text,
  add column if not exists parent_email_normalized text,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists provider_cancellation_required boolean not null default false,
  add column if not exists provider_cancellation_confirmed_at timestamptz,
  add column if not exists terms_content_hash text,
  add column if not exists checkout_started_at timestamptz;

create table if not exists public.team_payment_provider_events (
  id uuid primary key default gen_random_uuid(), provider text not null default 'invoice4u',
  event_key text not null unique, event_type text not null, payment_status text,
  request_id uuid references public.team_payment_requests(id) on delete set null,
  match_strategy text not null default 'unmatched', provider_customer_id text,
  provider_recurring_id text, provider_transaction_id text, amount_agorot integer,
  currency text not null default 'ILS', parent_phone text, parent_email text,
  source text not null default 'webhook', raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received', error_message text,
  occurred_at timestamptz, received_at timestamptz not null default now(),
  processed_at timestamptz, verification_status text not null default 'unverified',
  payload_schema_version text not null default 'v1', retry_count integer not null default 0,
  last_attempt_at timestamptz, next_retry_at timestamptz
);

create table if not exists public.team_payment_provider_secrets (
  id uuid primary key default gen_random_uuid(), provider text not null default 'invoice4u',
  secret_hash text not null, label text not null default 'Invoice4U / Zapier webhook',
  active boolean not null default true, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), last_used_at timestamptz, expires_at timestamptz
);

create table if not exists public.team_payment_settings (
  id smallint primary key default 1, season_label text not null,
  monthly_amount_agorot integer not null, billing_start_date date, billing_end_date date,
  number_of_cycles integer, provider_checkout_url text, terms_version text not null,
  link_expiry_days integer not null default 14, cancellation_notice_days integer not null default 14,
  price_change_notice_days integer not null default 30, payment_pending_attention_hours integer not null default 24,
  updated_at timestamptz not null default now(), checkout_mode text not null default 'static_product'
);

create table if not exists public.team_payment_terms_versions (
  version text primary key, content_hash text not null, hash_algorithm text not null default 'sha256',
  source_url text not null, effective_at timestamptz not null default now(), created_at timestamptz not null default now()
);

create table if not exists public.team_payment_verification_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.team_payment_requests(id) on delete cascade,
  proof_hash text not null unique, ip_hash text,
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  used_at timestamptz, created_at timestamptz not null default now()
);

insert into public.team_payment_settings(
  id,season_label,monthly_amount_agorot,billing_start_date,billing_end_date,number_of_cycles,
  provider_checkout_url,terms_version,link_expiry_days,cancellation_notice_days,
  price_change_notice_days,payment_pending_attention_hours,checkout_mode
) values (
  1,'2026/27',15000,'2026-10-01','2027-06-30',9,
  'https://private.invoice4u.co.il/newsite/he/clearing/public/i4u-clearing?ProductGuid=36e1e4a3-9aca-431d-8b14-ae1de1519a19',
  'team-2026-09-v1',14,14,30,24,'static_product'
) on conflict (id) do nothing;

insert into public.team_payment_terms_versions(version,content_hash,source_url,effective_at)
values ('team-2026-09-v1','6a8d12767ee4bb4ffffaaed59ef6409aa612c8eb298a60548235c59692ba0b4b',
'https://raphysitruk-eng.github.io/ryoku-do-team-payments/terms.html','2026-10-05T10:09:14Z')
on conflict (version) do nothing;

create index if not exists team_payment_requests_phone_norm_idx on public.team_payment_requests(parent_phone_normalized);
create index if not exists team_payment_requests_email_norm_idx on public.team_payment_requests(parent_email_normalized);
create index if not exists team_payment_requests_child_idx on public.team_payment_requests(child_id) where child_id is not null;
create index if not exists team_payment_requests_parent_profile_idx on public.team_payment_requests(parent_profile_id) where parent_profile_id is not null;
create index if not exists team_payment_requests_recent_checkout_idx on public.team_payment_requests(parent_phone_normalized,parent_email_normalized,checkout_started_at desc) where checkout_started_at is not null;
create index if not exists team_payment_requests_cancel_required_idx on public.team_payment_requests(provider_cancellation_required) where provider_cancellation_required=true;
create index if not exists team_payment_provider_events_request_idx on public.team_payment_provider_events(request_id);
create index if not exists team_payment_provider_events_transaction_idx on public.team_payment_provider_events(provider_transaction_id);
create index if not exists team_payment_provider_events_recurring_idx on public.team_payment_provider_events(provider_recurring_id);
create index if not exists team_payment_provider_events_status_idx on public.team_payment_provider_events(processing_status,received_at desc);
create index if not exists team_payment_provider_secrets_created_by_idx on public.team_payment_provider_secrets(created_by);
create index if not exists team_payment_verification_sessions_request_idx on public.team_payment_verification_sessions(request_id,expires_at desc);
create index if not exists team_payment_verification_sessions_expiry_idx on public.team_payment_verification_sessions(expires_at) where used_at is null;

alter table public.team_payment_provider_events enable row level security;
alter table public.team_payment_provider_secrets enable row level security;
alter table public.team_payment_settings enable row level security;
alter table public.team_payment_terms_versions enable row level security;
alter table public.team_payment_verification_sessions enable row level security;

revoke all on public.team_payment_provider_events from anon,authenticated;
revoke all on public.team_payment_provider_secrets from anon,authenticated;
revoke all on public.team_payment_settings from anon,authenticated;
revoke all on public.team_payment_terms_versions from anon,authenticated;
revoke all on public.team_payment_verification_sessions from anon,authenticated;
grant select,insert,update,delete on public.team_payment_provider_events to service_role;
grant select,insert,update,delete on public.team_payment_provider_secrets to service_role;
grant select,insert,update,delete on public.team_payment_settings to service_role;
grant select,insert,update,delete on public.team_payment_terms_versions to service_role;
grant select,insert,update,delete on public.team_payment_verification_sessions to service_role;
