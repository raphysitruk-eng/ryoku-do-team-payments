alter table public.team_payment_settings
  add column if not exists privacy_review_months integer not null default 24
  check (privacy_review_months between 6 and 120);

create table if not exists public.team_payment_system_health (
  id smallint primary key default 1 check (id=1),
  last_maintenance_at timestamptz,
  last_maintenance_status text not null default 'unknown'
    check (last_maintenance_status in ('unknown','ok','error')),
  last_maintenance_error text,
  updated_at timestamptz not null default now()
);
insert into public.team_payment_system_health(id) values(1)
on conflict (id) do nothing;
alter table public.team_payment_system_health enable row level security;
revoke all on public.team_payment_system_health from anon, authenticated;
grant select,insert,update,delete on public.team_payment_system_health to service_role;

create table if not exists public.team_payment_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  alert_type text not null,
  severity text not null default 'warning'
    check (severity in ('info','warning','critical')),
  request_id uuid references public.team_payment_requests(id) on delete cascade,
  provider_event_id uuid references public.team_payment_provider_events(id) on delete cascade,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.team_payment_operational_alerts enable row level security;
revoke all on public.team_payment_operational_alerts from anon, authenticated;
grant select,insert,update,delete on public.team_payment_operational_alerts to service_role;

create index if not exists team_payment_operational_alerts_status_idx
  on public.team_payment_operational_alerts(status,severity,last_seen_at desc);
create index if not exists team_payment_operational_alerts_request_idx
  on public.team_payment_operational_alerts(request_id)
  where request_id is not null;
create index if not exists team_payment_operational_alerts_event_idx
  on public.team_payment_operational_alerts(provider_event_id)
  where provider_event_id is not null;
