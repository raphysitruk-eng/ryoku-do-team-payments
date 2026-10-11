-- Grade exam intake is isolated from standing orders, open-mat access and student ranks.
create table public.grade_exam_registrations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('GE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  request_key_hash text not null unique check (request_key_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  student_identity_hash text not null check (student_identity_hash ~ '^[a-f0-9]{64}$'),
  full_name text not null check (length(full_name) between 2 and 100),
  national_id text not null check (national_id ~ '^[0-9]{9}$' and national_id <> '000000000'),
  birth_date date not null,
  registrant_kind text not null check (registrant_kind in ('self', 'guardian')),
  contact_name text not null check (length(contact_name) between 2 and 100),
  contact_phone text not null check (contact_phone ~ '^0(5[0-9]{8}|[23489][0-9]{7}|7[0-9]{8})$'),
  contact_email text not null default '' check (length(contact_email) <= 254),
  group_name text not null check (group_name in ('beginners', 'advanced', 'youth', 'adults')),
  branch text not null check (branch in ('herzog', 'agamim', 'waldberg')),
  current_rank text not null check (current_rank in ('white', 'yellow', 'orange', 'green', 'blue')),
  exam_season text not null check (exam_season ~ '^[0-9]{4}-[0-9]{2}$'),
  amount_agorot integer not null default 10000 check (amount_agorot = 10000),
  payment_method text not null check (payment_method in ('bit', 'paybox', 'cash')),
  payment_status text not null default 'awaiting_payment' check (payment_status in ('awaiting_payment', 'reported_unverified', 'verified')),
  payment_reference text not null default '' check (length(payment_reference) <= 100),
  payment_reported_at timestamptz,
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id),
  registration_status text not null default 'pending' check (registration_status in ('pending', 'approved', 'cancelled')),
  accuracy_consent boolean not null check (accuracy_consent),
  guardian_consent boolean not null default false,
  consent_version text not null check (consent_version = '2026-10-11.1'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index grade_exam_one_active_rank_idx on public.grade_exam_registrations (student_identity_hash, exam_season, current_rank) where registration_status <> 'cancelled';
create index grade_exam_created_idx on public.grade_exam_registrations (created_at desc, id);
create index grade_exam_branch_status_idx on public.grade_exam_registrations (branch, registration_status, created_at desc);

create table public.grade_exam_intake_limits (
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  hour_start timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  primary key (source_hash, hour_start)
);
create table public.grade_exam_audit (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.grade_exam_registrations(id),
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index grade_exam_audit_registration_idx on public.grade_exam_audit (registration_id, created_at desc);
alter table public.grade_exam_registrations enable row level security;
alter table public.grade_exam_intake_limits enable row level security;
alter table public.grade_exam_audit enable row level security;
revoke all on public.grade_exam_registrations, public.grade_exam_intake_limits, public.grade_exam_audit from public, anon, authenticated;
grant select, insert, update, delete on public.grade_exam_registrations, public.grade_exam_intake_limits, public.grade_exam_audit to service_role;
revoke all on sequence public.grade_exam_audit_id_seq from public, anon, authenticated;
grant usage, select on sequence public.grade_exam_audit_id_seq to service_role;

