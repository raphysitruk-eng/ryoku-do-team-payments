-- Run against Supabase with execute_sql. Everything, including test audit rows,
-- is rolled back. This does not call Invoice4U or charge/cancel any mandate.
begin;
set local statement_timeout='30s';
do $$
declare
  r_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); alias_id uuid:=gen_random_uuid();
  e_id uuid; rid text:='sync-test-'||gen_random_uuid(); payload jsonb; result jsonb;
  email text:='sync-'||gen_random_uuid()||'@example.invalid'; alias_email text:='payer-'||gen_random_uuid()||'@example.invalid';
  base jsonb; charge_count integer; pass_count integer:=0;
begin
  insert into public.team_payment_requests(id,token_hash,student_name,parent_name,parent_phone,parent_email,
    amount_agorot,number_of_cycles,request_status,payment_status,form_completed_at,checkout_started_at,season_label)
  values(r_id,encode(extensions.gen_random_bytes(32),'hex'),'Sync fixture child','Sync fixture parent','0509999900',email,
    15000,9,'payment_pending','not_started',now(),now()-interval '1 minute','sync-fixture');
  update public.team_payment_requests set parent_phone_normalized=parent_phone,parent_email_normalized=parent_email where id=r_id;
  insert into public.team_payment_consents(request_id,parent_name,parent_id_number,parent_phone,parent_email,
    health_has_issue,health_confirmed,photo_permission,terms_version,terms_content_hash,terms_accepted,payment_terms_accepted,
    admin_only_changes_accepted,no_auto_cancel_accepted,guardian_confirmed,signature_name,team_rules_accepted,privacy_accepted)
  select id,'Sync fixture parent','000000000','0509999900',email,false,true,false,terms_version,terms_content_hash,
    true,true,true,true,true,'Sync fixture parent',true,true from public.team_payment_requests where id=r_id;
  base:=jsonb_build_object('kind','invoice4u_api_setup','success',true,'standing_order_amount_agorot',15000,
    'standing_order_duration',9,'parent_phone','0509999900','parent_email',email,'provider_recurring_id',rid,'currency','ILS');

  insert into public.team_payment_provider_events(event_key,provider,source,event_type,request_id,verification_status,normalized_payload)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','standing_order_created',r_id,'unverified',base) returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'code'<>'UNVERIFIED_EVENT' or (select payment_status from public.team_payment_requests where id=r_id)<>'not_started'
    then raise exception 'Unsigned callback changed financial status';end if;
  pass_count:=pass_count+1;

  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','standing_order_created','verified',base) returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'processing_status'<>'processed' or (select payment_status from public.team_payment_requests where id=r_id)<>'active'
    or exists(select 1 from public.team_payment_charge_results where request_id=r_id)
    then raise exception 'Setup must activate mandate without fabricating a debit: %',result;end if;
  pass_count:=pass_count+1;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'duplicate'<>'true' then raise exception 'Setup replay was not idempotent';end if;
  pass_count:=pass_count+1;

  payload:=base||jsonb_build_object('kind','invoice4u_monthly_charge','standing_order_duration',null,'success',false,'document_success',null,'clearing_error','Fixture decline');
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_failed','verified',payload,'2026-10-10T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'processing_status'<>'processed' or not exists(select 1 from public.team_payment_requests
    where id=r_id and payment_status='failed' and provider_standing_order_status='active' and request_status='completed')
    or not exists(select 1 from public.team_payment_charge_results where request_id=r_id and outcome='failed')
    then raise exception 'Failed month incorrectly cancelled mandate: %',result;end if;
  pass_count:=pass_count+1;

  payload:=payload||jsonb_build_object('success',true,'document_success',false,'document_error','Fixture document failure','clearing_error',null);
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload,'2026-11-10T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'processing_status'<>'processed' or not exists(select 1 from public.team_payment_requests
    where id=r_id and payment_status='active' and provider_last_charge_status='succeeded')
    or not exists(select 1 from public.team_payment_charge_results where source_event_id=e_id and outcome='succeeded' and document_outcome='failed' and actual_amount_agorot is null)
    or not exists(select 1 from public.team_payment_operational_alerts where provider_event_id=e_id and alert_type='invoice4u_document_failed' and status='open')
    or exists(select 1 from public.team_payment_operational_alerts where request_id=r_id and alert_type='invoice4u_charge_failed' and status='open')
    then raise exception 'Charge/document outcomes were conflated: %',result;end if;
  pass_count:=pass_count+1;

  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload,'2026-11-10T08:01:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'duplicate'<>'true' or (select count(*) from public.team_payment_charge_results where request_id=r_id)<>2
    then raise exception 'Distinct duplicate event counted another charge';end if;
  pass_count:=pass_count+1;

  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_failed','verified',payload||'{"success":false}'::jsonb,'2026-11-10T08:02:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'code'<>'CONFLICTING_CHARGE_RESULT' or (select payment_status from public.team_payment_requests where id=r_id)<>'active'
    or (select count(*) from public.team_payment_charge_results where request_id=r_id)<>2 then raise exception 'Conflicting duplicate overwrote success';end if;
  pass_count:=pass_count+1;

  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_failed','verified',payload||'{"success":false}'::jsonb,'2026-09-10T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'processing_status'<>'processed' or not exists(select 1 from public.team_payment_requests
    where id=r_id and payment_status='active' and provider_last_charge_date='2026-11-10') then raise exception 'Old callback overwrote newer status';end if;
  pass_count:=pass_count+1;

  for payload in select base||x from (values
    ('{"kind":"invoice4u_monthly_charge","standing_order_amount_agorot":14900,"success":true}'::jsonb),
    ('{"kind":"invoice4u_monthly_charge","currency":"USD","success":true}'::jsonb),
    ('{"kind":"invoice4u_monthly_charge","provider_recurring_id":null,"success":true}'::jsonb)
  ) t(x) loop
    select count(*) into charge_count from public.team_payment_charge_results where request_id=r_id;
    insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload)
      values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload) returning id into e_id;
    result:=public.team_payment_apply_invoice4u_event(e_id);
    if result->>'processing_status'<>'failed' or (select count(*) from public.team_payment_charge_results where request_id=r_id)<>charge_count
      then raise exception 'Invalid financial metadata was accepted: %',result;end if;
    pass_count:=pass_count+1;
  end loop;

  insert into public.team_payment_requests(id,token_hash,student_name,parent_name,parent_phone,parent_email,request_status,amount_agorot,number_of_cycles)
    values(other_id,encode(extensions.gen_random_bytes(32),'hex'),'No form fixture','Other fixture parent','0509999901',email,'payment_pending',15000,9);
  update public.team_payment_requests set parent_phone_normalized=parent_phone,parent_email_normalized=parent_email where id=other_id;
  payload:=base||jsonb_build_object('provider_recurring_id',rid||'-no-form','parent_phone','0509999901');
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','standing_order_created','verified',payload) returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'code'<>'FORM_REQUIRED' or (select payment_status from public.team_payment_requests where id=other_id)='active'
    then raise exception 'Incomplete registration activated';end if;
  pass_count:=pass_count+1;

  update public.team_payment_requests set payment_status='cancelled',request_status='cancelled',provider_standing_order_status='cancelled',provider_cancellation_confirmed_at=now() where id=r_id;
  payload:=base||'{"kind":"invoice4u_monthly_charge","success":true,"document_success":true}'::jsonb;
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload,'2026-12-10T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'code'<>'CLOSED_STANDING_ORDER' or (select payment_status from public.team_payment_requests where id=r_id)<>'cancelled'
    then raise exception 'Confirmed cancellation was reactivated';end if;
  pass_count:=pass_count+1;
  update public.team_payment_requests set payment_status='active',provider_standing_order_status='active',provider_cancellation_confirmed_at=null,provider_cancellation_required=true where id=r_id;
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload,'2026-12-10T08:01:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'processing_status'<>'processed' or not exists(select 1 from public.team_payment_requests where id=r_id and request_status='cancelled' and provider_cancellation_required)
    then raise exception 'Provider callback cleared pending local cancellation';end if;
  pass_count:=pass_count+1;

  update public.team_payment_requests set provider_charge_start_date='2026-10-10',provider_charge_end_date='2027-06-10' where id=r_id;
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload,'2026-10-08T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'code'<>'CHARGE_OUTSIDE_CONFIRMED_SCHEDULE' then raise exception 'Out-of-schedule callback accepted';end if;
  pass_count:=pass_count+1;

  insert into public.team_payment_requests(id,token_hash,student_name,parent_name,parent_phone,parent_email,request_status,payment_status,form_completed_at,amount_agorot)
    values(alias_id,encode(extensions.gen_random_bytes(32),'hex'),'Alias fixture child','Registration guardian','0509999902',email,'completed','active',now(),15000);
  update public.team_payment_requests set parent_phone_normalized=parent_phone,parent_email_normalized=parent_email where id=alias_id;
  insert into public.team_payment_consents(request_id,parent_name,parent_id_number,parent_phone,parent_email,
    health_has_issue,health_confirmed,photo_permission,terms_version,terms_content_hash,terms_accepted,payment_terms_accepted,
    admin_only_changes_accepted,no_auto_cancel_accepted,guardian_confirmed,signature_name,team_rules_accepted,privacy_accepted)
  select id,'Registration guardian','000000000','0509999902',email,false,true,false,terms_version,terms_content_hash,
    true,true,true,true,true,'Registration guardian',true,true from public.team_payment_requests where id=alias_id;
  insert into public.team_payment_payer_aliases(request_id,parent_phone,parent_email,evidence_source)
    values(alias_id,'0509999903',alias_email,'admin_provider_confirmation');
  payload:=base||jsonb_build_object('kind','invoice4u_monthly_charge','provider_recurring_id',rid||'-alias',
    'parent_phone','0509999903','parent_email',alias_email,'success',true,'document_success',true);
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload,'2026-10-10T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'processing_status'<>'processed' or not exists(select 1 from public.team_payment_requests
    where id=alias_id and provider_recurring_id=rid||'-alias' and parent_name='Registration guardian' and parent_phone='0509999902')
    or (select match_strategy from public.team_payment_provider_events where id=e_id)<>'confirmed_payer_alias'
    then raise exception 'Confirmed payer alias did not bootstrap ID or overwrote guardian';end if;
  pass_count:=pass_count+1;

  insert into public.team_payment_payer_aliases(request_id,parent_phone,parent_email,evidence_source)
    values(other_id,'0509999903',alias_email,'admin_provider_confirmation');
  insert into public.team_payment_provider_events(event_key,provider,source,event_type,verification_status,normalized_payload,received_at)
    values('sync-test:'||gen_random_uuid(),'invoice4u','ipn','monthly_charge_succeeded','verified',payload||jsonb_build_object('provider_recurring_id',rid||'-ambiguous'),'2026-11-10T08:00:00Z') returning id into e_id;
  result:=public.team_payment_apply_invoice4u_event(e_id);
  if result->>'code'<>'AMBIGUOUS_PAYER' or result->>'processing_status'<>'unmatched' then raise exception 'Shared payer was guessed';end if;
  pass_count:=pass_count+1;

  if has_function_privilege('anon','public.team_payment_apply_invoice4u_event(uuid)','execute')
    or has_function_privilege('authenticated','public.team_payment_invoice4u_callback_config()','execute')
    or has_table_privilege('authenticated','public.team_payment_charge_results','select')
    or not has_function_privilege('service_role','public.team_payment_apply_invoice4u_event(uuid)','execute')
    then raise exception 'Privilege boundary failed';end if;
  pass_count:=pass_count+1;
  perform set_config('ryoku_sync_test.pass_count',pass_count::text,true);
end $$;
select current_setting('ryoku_sync_test.pass_count')::integer as database_checks_passed;
rollback;
