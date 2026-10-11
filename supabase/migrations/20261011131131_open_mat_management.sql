alter table public.open_mat_registrations
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references public.profiles(id);

create table if not exists public.open_mat_audit (
  id uuid primary key default gen_random_uuid(),
  registration_reference text not null references public.open_mat_registrations(reference) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action = 'admin_updated'),
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.open_mat_audit enable row level security;
revoke all on public.open_mat_audit from public, anon, authenticated;
grant select, insert on public.open_mat_audit to service_role;
create index if not exists open_mat_audit_registration_idx on public.open_mat_audit(registration_reference, created_at desc);
create index if not exists open_mat_audit_actor_idx on public.open_mat_audit(actor_id);
create index if not exists open_mat_verified_by_idx on public.open_mat_registrations(payment_verified_by);

create or replace function public.touch_open_mat_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_open_mat_registration() from public, anon, authenticated;
grant execute on function public.touch_open_mat_registration() to service_role;
drop trigger if exists open_mat_registration_updated_at on public.open_mat_registrations;
create trigger open_mat_registration_updated_at before update on public.open_mat_registrations
  for each row execute function public.touch_open_mat_registration();

create or replace function public.admin_update_open_mat(
  p_reference text, p_actor uuid, p_expected_updated_at timestamptz,
  p_payment_status text, p_booking_status text, p_payment_confirmed boolean, p_note text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.open_mat_registrations%rowtype; v_before jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and approval_status='approved') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if p_payment_status is null or p_payment_status not in ('awaiting_payment','reported_unverified','verified')
    or p_booking_status is null or p_booking_status not in ('pending_approval','approved','cancelled')
    or p_note is null or length(trim(p_note)) not between 3 and 500 then
    return jsonb_build_object('ok',false,'code','INVALID');
  end if;
  select * into v_row from public.open_mat_registrations where reference=p_reference for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if p_expected_updated_at is null or v_row.updated_at<>p_expected_updated_at then
    return jsonb_build_object('ok',false,'code','STALE_RECORD');
  end if;
  if p_payment_status='verified' and v_row.payment_status<>'verified' and p_payment_confirmed is distinct from true then
    return jsonb_build_object('ok',false,'code','PAYMENT_EVIDENCE_REQUIRED');
  end if;
  if p_booking_status='approved' and p_payment_status<>'verified' then
    return jsonb_build_object('ok',false,'code','PAYMENT_REQUIRED');
  end if;
  v_before:=jsonb_build_object('payment_status',v_row.payment_status,'booking_status',v_row.booking_status);
  update public.open_mat_registrations set payment_status=p_payment_status, booking_status=p_booking_status,
    payment_verified_at=case when p_payment_status='verified' then coalesce(payment_verified_at,now()) else null end,
    payment_verified_by=case when p_payment_status='verified' then coalesce(payment_verified_by,p_actor) else null end
    where reference=p_reference returning * into v_row;
  insert into public.open_mat_audit(registration_reference,actor_id,action,details)
    values(p_reference,p_actor,'admin_updated',jsonb_build_object('before',v_before,
      'after',jsonb_build_object('payment_status',v_row.payment_status,'booking_status',v_row.booking_status),
      'payment_confirmed',p_payment_confirmed is true,'note',trim(p_note)));
  return jsonb_build_object('ok',true,'registration',jsonb_build_object('reference',v_row.reference,
    'payment_status',v_row.payment_status,'booking_status',v_row.booking_status,'updated_at',v_row.updated_at));
end;
$$;
revoke all on function public.admin_update_open_mat(text,uuid,timestamptz,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_update_open_mat(text,uuid,timestamptz,text,text,boolean,text) to service_role;
