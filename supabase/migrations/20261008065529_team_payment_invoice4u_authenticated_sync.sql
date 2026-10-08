-- Invoice4U sends unsigned callbacks and discards query strings on monthly
-- callbacks. An unguessable, stable URL path authenticates provider delivery.
-- Its encrypted value is never shipped to the public client or source control.
alter table public.team_payment_provider_secrets
  add column if not exists purpose text not null default 'bridge';
alter table public.team_payment_provider_secrets
  add constraint team_payment_provider_secret_purpose_check
  check (purpose in ('bridge','invoice4u_ipn_path'));

do $$
declare v_secret text;
begin
  if not exists (select 1 from vault.secrets where name='team_payment_invoice4u_ipn_path') then
    v_secret:=encode(extensions.gen_random_bytes(48),'hex');
    perform vault.create_secret(v_secret,'team_payment_invoice4u_ipn_path',
      'Stable Invoice4U callback path. Do not rotate without updating existing orders.');
    insert into public.team_payment_provider_secrets(provider,secret_hash,label,purpose)
    values ('invoice4u',encode(extensions.digest(v_secret,'sha256'),'hex'),
      'Invoice4U standing-order callback path','invoice4u_ipn_path');
  end if;
end $$;

alter table public.team_payment_requests
  add column if not exists provider_standing_order_status text,
  add column if not exists provider_charge_start_date date,
  add column if not exists provider_charge_end_date date,
  add column if not exists provider_last_charge_status text,
  add column if not exists provider_last_charge_date date;
alter table public.team_payment_requests
  add constraint team_payment_standing_order_status_check
  check (provider_standing_order_status in ('pending','active','cancelled','finished')),
  add constraint team_payment_last_charge_status_check
  check (provider_last_charge_status in ('succeeded','failed'));
create unique index if not exists team_payment_request_recurring_unique
  on public.team_payment_requests(provider,provider_recurring_id)
  where provider_recurring_id is not null;

create table public.team_payment_payer_aliases (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.team_payment_requests(id),
  parent_phone text not null default '',
  parent_email text not null default '',
  evidence_event_id uuid references public.team_payment_provider_events(id),
  evidence_source text not null check(evidence_source in ('authenticated_setup','admin_provider_confirmation')),
  approved_by uuid,
  created_at timestamptz not null default now(),
  check (parent_phone<>'' or parent_email<>''),
  unique (request_id,parent_phone,parent_email)
);
create index team_payment_payer_alias_contact
  on public.team_payment_payer_aliases(parent_phone,parent_email);
create index team_payment_payer_alias_evidence
  on public.team_payment_payer_aliases(evidence_event_id);

create table public.team_payment_charge_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.team_payment_requests(id),
  provider_recurring_id text not null,
  charge_date date not null,
  outcome text not null check(outcome in ('succeeded','failed')),
  reported_plan_amount_agorot integer not null check(reported_plan_amount_agorot>0),
  actual_amount_agorot integer check(actual_amount_agorot>=0),
  document_outcome text not null check(document_outcome in ('succeeded','failed','unknown')),
  clearing_error text,
  document_error text,
  source_event_id uuid not null references public.team_payment_provider_events(id),
  created_at timestamptz not null default now(),
  unique (provider_recurring_id,charge_date)
);
create index team_payment_charge_request_date
  on public.team_payment_charge_results(request_id,charge_date desc);
create index team_payment_charge_source_event
  on public.team_payment_charge_results(source_event_id);
alter table public.team_payment_payer_aliases enable row level security;
alter table public.team_payment_charge_results enable row level security;
revoke all on public.team_payment_payer_aliases,public.team_payment_charge_results from public,anon,authenticated;
grant select,insert,update on public.team_payment_payer_aliases,public.team_payment_charge_results to service_role;

create or replace function public.team_payment_invoice4u_callback_config()
returns jsonb language plpgsql security invoker
set search_path = '' as $$
declare v_secret text; v_meta jsonb; v_last timestamptz;
begin
  select v.decrypted_secret,jsonb_build_object('created_at',s.created_at,'last_used_at',s.last_used_at)
    into v_secret,v_meta
  from vault.decrypted_secrets v join public.team_payment_provider_secrets s
    on s.secret_hash=encode(extensions.digest(v.decrypted_secret,'sha256'),'hex')
  where v.name='team_payment_invoice4u_ipn_path' and s.active
    and s.purpose='invoice4u_ipn_path' and (s.expires_at is null or s.expires_at>now());
  select max(received_at) into v_last from public.team_payment_provider_events
    where source='ipn' and verification_status='verified';
  return jsonb_build_object('ready',v_secret is not null,
    'callback_path',case when v_secret is null then null else '/notify/'||v_secret end,
    'secret_meta',v_meta,'last_authenticated_callback_at',v_last);
end $$;
revoke all on function public.team_payment_invoice4u_callback_config() from public,anon,authenticated;
grant execute on function public.team_payment_invoice4u_callback_config() to service_role;

create or replace function public.team_payment_apply_invoice4u_event(p_event_id uuid)
returns jsonb language plpgsql security invoker
set search_path = '' as $$
declare
  ev public.team_payment_provider_events%rowtype;
  r public.team_payment_requests%rowtype;
  old_charge public.team_payment_charge_results%rowtype;
  v_kind text; v_rid text; v_phone text; v_email text; v_success boolean;
  v_doc text; v_amount integer; v_cycles integer; v_day date;
  v_ids uuid[]; v_id uuid; v_strategy text:='unmatched'; v_error text;
  v_charge_id uuid; v_is_monthly boolean; v_latest boolean;
begin
  select * into ev from public.team_payment_provider_events where id=p_event_id for update;
  if not found then return jsonb_build_object('processing_status','failed','code','EVENT_NOT_FOUND'); end if;
  if ev.processing_status in ('processed','ignored') then
    return jsonb_build_object('processing_status',ev.processing_status,'duplicate',true);
  end if;
  if ev.provider<>'invoice4u' or ev.source<>'ipn' or ev.verification_status<>'verified' then
    return jsonb_build_object('processing_status',ev.processing_status,'code','UNVERIFIED_EVENT');
  end if;
  update public.team_payment_provider_events set retry_count=retry_count+1,last_attempt_at=now(),next_retry_at=null where id=ev.id;
  v_kind:=ev.normalized_payload->>'kind';
  v_is_monthly:=v_kind='invoice4u_monthly_charge';
  v_rid:=nullif(ev.normalized_payload->>'provider_recurring_id','');
  v_phone:=coalesce(ev.normalized_payload->>'parent_phone','');
  v_email:=coalesce(ev.normalized_payload->>'parent_email','');
  v_amount:=(ev.normalized_payload->>'standing_order_amount_agorot')::integer;
  v_cycles:=(ev.normalized_payload->>'standing_order_duration')::integer;
  v_success:=(ev.normalized_payload->>'success')::boolean;
  v_day:=(ev.received_at at time zone 'Asia/Jerusalem')::date;
  v_doc:=case ev.normalized_payload->>'document_success' when 'true' then 'succeeded' when 'false' then 'failed' else 'unknown' end;

  <<process_event>>
  begin
    if v_kind not in ('invoice4u_monthly_charge','invoice4u_api_setup','invoice4u_sales_page_setup') or v_success is null then
      v_error:='UNSUPPORTED_PROVIDER_RESULT'; exit process_event;
    end if;
    if coalesce(ev.normalized_payload->>'currency','ILS')<>'ILS' then
      v_error:='CURRENCY_MISMATCH'; exit process_event;
    end if;
    if v_amount is null or v_amount<=0 then v_error:='INVALID_PLAN_AMOUNT'; exit process_event; end if;
    if v_is_monthly and v_rid is null then v_error:='MISSING_STANDING_ORDER_ID'; exit process_event; end if;
    if v_rid is not null then
      -- Serialize first-time association as well as concurrent callbacks. The
      -- unique index protects against an order being assigned to two children.
      perform pg_advisory_xact_lock(hashtextextended('invoice4u:'||v_rid,0));
      select array_agg(id) into v_ids from public.team_payment_requests
        where provider='invoice4u' and provider_recurring_id=v_rid;
      if cardinality(v_ids)=1 then v_id:=v_ids[1];v_strategy:='provider_recurring_id';
      elsif cardinality(v_ids)>1 then v_error:='AMBIGUOUS_STANDING_ORDER_ID';exit process_event;end if;
    end if;
    if v_id is null and ev.normalized_payload->>'admin_associated_request_id' is not null then
      select request_id into v_id from public.team_payment_audit_log
        where action='invoice4u_payer_linked' and details->>'event_id'=ev.id::text
          and request_id::text=ev.normalized_payload->>'admin_associated_request_id'
        order by created_at desc limit 1;
      if v_id is not null then v_strategy:='admin_confirmed';end if;
    end if;
    if v_id is null and (v_phone<>'' or v_email<>'') then
      select array_agg(distinct a.request_id) into v_ids
        from public.team_payment_payer_aliases a join public.team_payment_requests q on q.id=a.request_id
        where q.provider='invoice4u' and (v_phone='' or a.parent_phone=v_phone)
          and (v_email='' or a.parent_email=v_email)
          and q.request_status in ('sent','opened','form_completed','payment_pending','completed');
      if cardinality(v_ids)=1 then v_id:=v_ids[1];v_strategy:='confirmed_payer_alias';
      elsif cardinality(v_ids)>1 then v_error:='AMBIGUOUS_PAYER';exit process_event;end if;
    end if;
    if v_id is null and (v_phone<>'' or v_email<>'') then
      select array_agg(id) into v_ids from public.team_payment_requests
        where provider='invoice4u' and (v_phone='' or parent_phone_normalized=v_phone)
          and (v_email='' or parent_email_normalized=v_email)
          and request_status in ('sent','opened','form_completed','payment_pending','completed');
      if cardinality(v_ids)=1 then
        v_id:=v_ids[1];v_strategy:=case when v_phone<>'' and v_email<>'' then 'phone_email_unique' when v_phone<>'' then 'phone_unique' else 'email_unique' end;
      elsif cardinality(v_ids)>1 then
        if not v_is_monthly then
          select array_agg(id) into v_ids from public.team_payment_requests where id=any(v_ids)
            and request_status='payment_pending' and payment_status not in ('active','finished','cancelled')
            and checkout_started_at between ev.received_at-interval '30 minutes' and ev.received_at;
          if cardinality(v_ids)=1 then v_id:=v_ids[1];v_strategy:='recent_checkout_unique'; end if;
        end if;
        if v_id is null then v_error:='AMBIGUOUS_PAYER';exit process_event;end if;
      end if;
    end if;
    if v_id is null and not v_is_monthly and v_phone<>'' and v_email<>'' and v_cycles is not null then
      -- A sales-page payer can use another email, but only one unique recent
      -- checkout with matching plan metadata can be associated automatically.
      select array_agg(id) into v_ids from public.team_payment_requests where provider='invoice4u'
        and parent_phone_normalized=v_phone and request_status in ('sent','opened','form_completed','payment_pending','completed');
      if cardinality(v_ids)>1 then v_error:='AMBIGUOUS_PAYER';exit process_event;end if;
      if cardinality(v_ids)=1 then
        if exists(select 1 from public.team_payment_requests where parent_email_normalized=v_email and id<>v_ids[1]
          and request_status in ('sent','opened','form_completed','payment_pending','completed')) then
          v_error:='CONFLICTING_PAYER_EMAIL';exit process_event;
        end if;
        select id into v_id from public.team_payment_requests where id=v_ids[1]
          and request_status='payment_pending' and payment_status not in ('active','finished','cancelled')
          and checkout_started_at between ev.received_at-interval '30 minutes' and ev.received_at
          and amount_agorot=v_amount and number_of_cycles=v_cycles;
        if v_id is not null then v_strategy:='phone_recent_checkout_email_mismatch';end if;
      end if;
    end if;
    if v_id is null then v_error:='PAYER_MAPPING_REQUIRED';exit process_event;end if;
    select * into r from public.team_payment_requests where id=v_id for update;
    if r.amount_agorot<>v_amount or (not v_is_monthly and v_cycles is not null and r.number_of_cycles is distinct from v_cycles) then
      v_error:='PLAN_MISMATCH';exit process_event;
    end if;
    if r.provider_recurring_id is not null and v_rid is not null and r.provider_recurring_id<>v_rid then
      v_error:='STANDING_ORDER_ID_CONFLICT';exit process_event;
    end if;
    if r.payment_status in ('cancelled','finished') or r.provider_cancellation_confirmed_at is not null
      or r.provider_standing_order_status in ('cancelled','finished') then
      v_error:='CLOSED_STANDING_ORDER';exit process_event;
    end if;
    if r.form_completed_at is null or not exists(select 1 from public.team_payment_consents c where c.request_id=r.id
      and c.health_confirmed and c.team_rules_accepted and c.payment_terms_accepted and c.privacy_accepted
      and c.admin_only_changes_accepted and c.no_auto_cancel_accepted and c.guardian_confirmed) then
      v_error:='FORM_REQUIRED';exit process_event;
    end if;
    if not v_is_monthly and r.request_status not in ('payment_pending','completed','cancelled') then
      v_error:='CHECKOUT_NOT_STARTED';exit process_event;
    end if;
    if v_is_monthly and ((r.provider_charge_start_date is not null and v_day<r.provider_charge_start_date)
      or (r.provider_charge_end_date is not null and v_day>r.provider_charge_end_date)) then
      v_error:='CHARGE_OUTSIDE_CONFIRMED_SCHEDULE';exit process_event;
    end if;

    if v_is_monthly then
      insert into public.team_payment_charge_results(request_id,provider_recurring_id,charge_date,outcome,
        reported_plan_amount_agorot,actual_amount_agorot,document_outcome,clearing_error,document_error,source_event_id)
      values(r.id,v_rid,v_day,case when v_success then 'succeeded' else 'failed' end,v_amount,null,v_doc,
        ev.normalized_payload->>'clearing_error',ev.normalized_payload->>'document_error',ev.id)
      on conflict (provider_recurring_id,charge_date) do nothing returning id into v_charge_id;
      if v_charge_id is null then
        select * into old_charge from public.team_payment_charge_results where provider_recurring_id=v_rid and charge_date=v_day;
        if old_charge.request_id<>r.id or old_charge.outcome<>(case when v_success then 'succeeded' else 'failed' end)
          or old_charge.document_outcome<>v_doc or old_charge.reported_plan_amount_agorot<>v_amount then
          v_error:='CONFLICTING_CHARGE_RESULT';exit process_event;
        end if;
        update public.team_payment_provider_events set request_id=r.id,match_strategy=v_strategy,
          processing_status='ignored',error_message='DUPLICATE_MONTHLY_RESULT',processed_at=now() where id=ev.id;
        return jsonb_build_object('processing_status','ignored','duplicate',true);
      end if;
      v_latest:=r.provider_last_charge_date is null or v_day>=r.provider_last_charge_date;
      update public.team_payment_requests set provider_recurring_id=v_rid,
        provider_standing_order_status='active',provider_last_charge_date=case when v_latest then v_day else provider_last_charge_date end,
        provider_last_charge_status=case when v_latest then case when v_success then 'succeeded' else 'failed' end else provider_last_charge_status end,
        payment_status=case when v_latest then case when v_success then 'active' else 'failed' end else payment_status end,
        request_status=case when request_status='cancelled' then request_status else 'completed' end,
        completed_at=coalesce(completed_at,now()),provider_last_event_id=ev.event_key,
        provider_last_synced_at=now(),provider_sync_source='invoice4u_authenticated_ipn',updated_at=now()
      where id=r.id;
    elsif v_success then
      update public.team_payment_requests set provider_recurring_id=coalesce(v_rid,provider_recurring_id),
        provider_customer_id=coalesce(ev.normalized_payload->>'provider_customer_id',provider_customer_id),
        provider_standing_order_status='active',payment_status=case when provider_last_charge_status='failed' then 'failed' else 'active' end,
        request_status=case when request_status='cancelled' then request_status else 'completed' end,
        completed_at=coalesce(completed_at,now()),provider_last_event_id=ev.event_key,
        provider_last_synced_at=now(),provider_sync_source='invoice4u_authenticated_ipn',updated_at=now()
      where id=r.id;
      if v_phone<>'' or v_email<>'' then
        insert into public.team_payment_payer_aliases(request_id,parent_phone,parent_email,evidence_event_id,evidence_source)
        values(r.id,v_phone,v_email,ev.id,'authenticated_setup') on conflict (request_id,parent_phone,parent_email) do nothing;
      end if;
    else
      -- A failed attempt to create another mandate cannot downgrade an existing
      -- active mandate or overwrite its identity.
      update public.team_payment_requests set payment_status=case when provider_standing_order_status='active' or payment_status='active' then payment_status else 'failed' end,
        provider_last_event_id=ev.event_key,provider_last_synced_at=now(),provider_sync_source='invoice4u_authenticated_ipn',updated_at=now()
      where id=r.id;
    end if;
    update public.team_payment_provider_events set request_id=r.id,match_strategy=v_strategy,
      payment_status=case when v_success then 'active' else 'failed' end,processing_status='processed',
      error_message=null,processed_at=now(),normalized_payload=normalized_payload||jsonb_build_object(
        'actual_debit_confirmed',v_is_monthly and v_success,'charge_date',case when v_is_monthly then v_day else null end,
        'document_outcome',v_doc,'request_id',r.id) where id=ev.id;
    insert into public.team_payment_audit_log(request_id,actor_type,action,details)
    values(r.id,'invoice4u',ev.event_type,jsonb_build_object('event_id',ev.id,'match_strategy',v_strategy,
      'actual_debit_confirmed',v_is_monthly and v_success,'reported_plan_amount_agorot',v_amount,'actual_amount_agorot',null,
      'document_outcome',v_doc,'standing_order_status','active'));
    if v_is_monthly then
      update public.team_payment_operational_alerts set status='resolved',resolved_at=now(),last_seen_at=now()
      where alert_key='invoice4u_charge_failed:'||r.id and status='open' and v_success and v_latest;
      if not v_success and v_latest then
        insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,provider_event_id,title,details)
        values('invoice4u_charge_failed:'||r.id,'invoice4u_charge_failed','warning',r.id,ev.id,'החיוב החודשי ב-Invoice4U נכשל',
          jsonb_build_object('charge_date',v_day,'standing_order_status','active','error',ev.normalized_payload->>'clearing_error'))
        on conflict(alert_key) do update set status='open',resolved_at=null,last_seen_at=now(),provider_event_id=excluded.provider_event_id,details=excluded.details;
      end if;
      if v_doc='failed' then
        insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,provider_event_id,title,details)
        values('invoice4u_document_failed:'||v_charge_id,'invoice4u_document_failed','warning',r.id,ev.id,'הפקת מסמך ב-Invoice4U נכשלה',
          jsonb_build_object('charge_date',v_day,'charge_succeeded',v_success,'error',ev.normalized_payload->>'document_error'))
        on conflict(alert_key) do nothing;
      end if;
    end if;
    update public.team_payment_operational_alerts set status='resolved',resolved_at=now(),last_seen_at=now()
      where provider_event_id=ev.id and status='open' and alert_type in ('provider_event_pending_mapping','provider_event_failed','provider_event_unmatched','invoice4u_processing_required');
    return jsonb_build_object('processing_status','processed','request_id',r.id);
  end process_event;

  update public.team_payment_provider_events set request_id=coalesce(v_id,request_id),match_strategy=v_strategy,
    processing_status=case when v_error in ('PAYER_MAPPING_REQUIRED','AMBIGUOUS_PAYER','CONFLICTING_PAYER_EMAIL') then 'unmatched' else 'failed' end,
    error_message=v_error,processed_at=now(),next_retry_at=null where id=ev.id;
  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,provider_event_id,title,details)
  values('invoice4u_processing:'||ev.id,'invoice4u_processing_required','warning',v_id,ev.id,'התראת Invoice4U דורשת בירור',
    jsonb_build_object('code',v_error,'event_type',ev.event_type))
  on conflict(alert_key) do update set status='open',last_seen_at=now(),resolved_at=null,details=excluded.details;
  return jsonb_build_object('processing_status',case when v_error in ('PAYER_MAPPING_REQUIRED','AMBIGUOUS_PAYER','CONFLICTING_PAYER_EMAIL') then 'unmatched' else 'failed' end,'code',v_error);
end $$;
revoke all on function public.team_payment_apply_invoice4u_event(uuid) from public,anon,authenticated;
grant execute on function public.team_payment_apply_invoice4u_event(uuid) to service_role;

create or replace function public.team_payment_link_invoice4u_payer(p_event_id uuid,p_request_id uuid,p_actor_id uuid,p_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ev public.team_payment_provider_events%rowtype; r public.team_payment_requests%rowtype;
begin
  if length(trim(coalesce(p_note,'')))<8 or length(p_note)>500 then raise exception 'PROVIDER_EVIDENCE_REQUIRED';end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and approval_status='approved') then
    raise exception 'UNAUTHORIZED';
  end if;
  select * into ev from public.team_payment_provider_events where id=p_event_id for update;
  if not found or ev.provider<>'invoice4u' or ev.source<>'ipn' then raise exception 'EVENT_NOT_FOUND';end if;
  if ev.processing_status='processed' and ev.request_id is distinct from p_request_id then raise exception 'EVENT_ALREADY_LINKED';end if;
  if ev.provider_recurring_id is not null then perform pg_advisory_xact_lock(hashtextextended('invoice4u:'||ev.provider_recurring_id,0));end if;
  select * into r from public.team_payment_requests where id=p_request_id for update;
  if not found or r.form_completed_at is null then raise exception 'FORM_REQUIRED';end if;
  if r.payment_status in ('finished','cancelled') or r.provider_cancellation_confirmed_at is not null then raise exception 'CLOSED_STANDING_ORDER';end if;
  if ev.normalized_payload->>'standing_order_amount_agorot' is null or
    (ev.normalized_payload->>'standing_order_amount_agorot')::integer<>r.amount_agorot then raise exception 'PLAN_MISMATCH';end if;
  if coalesce(ev.parent_phone,'')='' and coalesce(ev.parent_email,'')='' then raise exception 'PAYER_CONTACT_REQUIRED';end if;
  if ev.provider_recurring_id is not null and exists(select 1 from public.team_payment_requests
    where provider_recurring_id=ev.provider_recurring_id and id<>r.id) then raise exception 'STANDING_ORDER_ID_CONFLICT';end if;
  insert into public.team_payment_payer_aliases(request_id,parent_phone,parent_email,evidence_event_id,evidence_source,approved_by)
  values(r.id,coalesce(ev.parent_phone,''),coalesce(ev.parent_email,''),ev.id,'admin_provider_confirmation',p_actor_id)
  on conflict(request_id,parent_phone,parent_email) do nothing;
  insert into public.team_payment_audit_log(request_id,actor_type,actor_id,action,details)
  values(r.id,'admin',p_actor_id,'invoice4u_payer_linked',jsonb_build_object('event_id',ev.id,'provider_evidence',p_note,'registration_contacts_preserved',true));
  update public.team_payment_provider_events set request_id=r.id,match_strategy='admin_confirmed',
    normalized_payload=normalized_payload||jsonb_build_object('admin_associated_request_id',r.id),
    processing_status=case when verification_status='verified' then 'received' else processing_status end
  where id=ev.id;
  if ev.verification_status='verified' then return public.team_payment_apply_invoice4u_event(ev.id);end if;
  return jsonb_build_object('processing_status',ev.processing_status,'code','LINKED_AWAITING_AUTHENTICATED_CALLBACK');
end $$;
revoke all on function public.team_payment_link_invoice4u_payer(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.team_payment_link_invoice4u_payer(uuid,uuid,uuid,text) to service_role;

-- Only captures already confirmed by an administrator with provider evidence
-- are reconciled. Registration contacts are preserved; no debit is fabricated.
insert into public.team_payment_payer_aliases(request_id,parent_phone,parent_email,evidence_event_id,evidence_source)
select e.request_id,coalesce(e.parent_phone,''),coalesce(e.parent_email,''),e.id,'admin_provider_confirmation'
from public.team_payment_provider_events e join public.team_payment_requests r on r.id=e.request_id
where e.normalized_payload->>'standing_order_status_confirmed'='active'
  and e.normalized_payload->>'manual_confirmation_source' like 'invoice4u_admin_screenshot%'
  and e.normalized_payload->>'manual_confirmation_sha256' ~ '^[a-f0-9]{64}$'
  and r.payment_status='active' and (coalesce(e.parent_phone,'')<>'' or coalesce(e.parent_email,'')<>'')
  and (e.normalized_payload->>'confirmed_monthly_amount_agorot')::integer=r.amount_agorot
on conflict (request_id,parent_phone,parent_email) do nothing;
update public.team_payment_requests r set provider_standing_order_status='active',
  provider_charge_start_date=(e.normalized_payload->>'confirmed_provider_billing_start_date')::date,
  provider_charge_end_date=(e.normalized_payload->>'confirmed_provider_billing_end_date')::date
from public.team_payment_provider_events e join public.team_payment_payer_aliases a on a.evidence_event_id=e.id
where r.id=e.request_id and a.evidence_source='admin_provider_confirmation' and r.payment_status='active';
update public.team_payment_provider_events e set processing_status='processed',error_message=null,processed_at=coalesce(processed_at,now()),
  normalized_payload=normalized_payload||jsonb_build_object('note','Provider mandate confirmed manually; no actual debit has been confirmed')
where exists(select 1 from public.team_payment_payer_aliases a where a.evidence_event_id=e.id and a.evidence_source='admin_provider_confirmation');

-- Recover database processing failures after durable capture. Invoice4U sends
-- each monthly notification only once, so recovery must happen locally.
create or replace function private.team_payment_retry_invoice4u_events()
returns void language plpgsql security invoker set search_path='' as $$
declare v_event uuid;
begin
  for v_event in select id from public.team_payment_provider_events
    where provider='invoice4u' and source='ipn' and verification_status='verified'
      and processing_status='received' and retry_count<10
      and (next_retry_at is null or next_retry_at<=now())
    order by received_at limit 100
  loop
    begin
      perform public.team_payment_apply_invoice4u_event(v_event);
    exception when others then
      update public.team_payment_provider_events set retry_count=retry_count+1,last_attempt_at=now(),
        next_retry_at=now()+interval '10 minutes',error_message='PROCESSING_RETRY_REQUIRED' where id=v_event;
    end;
  end loop;
end $$;
revoke all on function private.team_payment_retry_invoice4u_events() from public,anon,authenticated;
select cron.schedule('team-payment-invoice4u-retry','*/5 * * * *','select private.team_payment_retry_invoice4u_events();');
