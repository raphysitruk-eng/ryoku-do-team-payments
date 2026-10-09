begin;
do $$
declare
  p jsonb;
  first_result jsonb;
  replay jsonb;
  next_monday date := (now() at time zone 'Asia/Jerusalem')::date + ((8-extract(isodow from now() at time zone 'Asia/Jerusalem')::int)%7+7);
  key_hash text := md5(random()::text)||md5(random()::text);
  payload_hash text := md5(random()::text)||md5(random()::text);
  session_hash text := md5(random()::text)||md5(random()::text);
  reference text := 'OM-'||upper(substr(md5(random()::text),1,12));
  job public.open_mat_notifications;
  ok boolean;
begin
  p:=jsonb_build_object('reference',reference,'requestKeyHash',key_hash,'participantSessionHash',session_hash,'payloadHash',payload_hash,
    'fullName','מתאמן בדיקה','nationalId','123456782','phone','0500000000','email','test@example.invalid',
    'birthDate','1990-01-01','trainingDate',next_monday,'trainingTime','20:30','termsVersion','2026-10-09.2',
    'termsHash',repeat('a',64),'consentSnapshot','{"adult":true,"hall":true,"equipment":true,"insurance":true,"termsAndPrivacy":true}'::jsonb);
  first_result:=public.register_open_mat(p,repeat('b',64));
  assert first_result->>'reference'=reference, 'reference retained';
  assert first_result->>'status'='awaiting_payment', 'no paid claim';
  assert (select count(*)=2 from public.open_mat_notifications where registration_reference=reference), 'exactly two mails';
  assert (select recipient_email='raphy.sitruk@gmail.com' from public.open_mat_notifications where registration_reference=reference and kind='admin'), 'owner identity fixed';
  assert not exists(select 1 from public.open_mat_notifications where registration_reference=reference and (body_text like '%123456782%' or body_text like '%1990-01-01%' or body_text like '%'||key_hash||'%')), 'no identity or credential in emails';
  replay:=public.register_open_mat(p,repeat('b',64));
  assert (replay->>'replayed')::boolean and replay->>'reference'=reference, 'idempotent retry';
  assert (select count(*)=2 from public.open_mat_notifications where registration_reference=reference), 'no duplicate emails';
  begin perform public.register_open_mat(p||jsonb_build_object('payloadHash',repeat('c',64)),repeat('b',64));raise exception 'TEST_FAILURE_KEY'; exception when others then if sqlerrm<>'KEY_CONFLICT' then raise; end if; end;
  begin perform public.register_open_mat(p||jsonb_build_object('requestKeyHash',repeat('d',64)),repeat('b',64));raise exception 'TEST_FAILURE_DUPLICATE'; exception when others then if sqlerrm<>'DUPLICATE_SESSION' then raise; end if; end;
  begin perform public.register_open_mat(p||jsonb_build_object('requestKeyHash',repeat('e',64),'birthDate',(now() at time zone 'Asia/Jerusalem')::date-interval '17 years'),repeat('b',64));raise exception 'TEST_FAILURE_MINOR'; exception when others then if sqlerrm<>'ADULTS_ONLY' then raise; end if; end;
  begin perform public.register_open_mat(p||jsonb_build_object('requestKeyHash',repeat('e',64),'trainingDate',next_monday+2),repeat('b',64));raise exception 'TEST_FAILURE_WEEKDAY'; exception when others then if sqlerrm<>'INVALID_DATE' then raise; end if; end;
  begin perform public.register_open_mat(p||jsonb_build_object('requestKeyHash',repeat('e',64),'trainingTime','22:30'),repeat('b',64));raise exception 'TEST_FAILURE_TIME'; exception when others then if sqlerrm<>'INVALID_DATE' then raise; end if; end;
  begin perform public.register_open_mat(p||jsonb_build_object('requestKeyHash',repeat('e',64),'consentSnapshot','{}'::jsonb),repeat('b',64));raise exception 'TEST_FAILURE_CONSENT'; exception when others then if sqlerrm<>'INVALID_CONSENT' then raise; end if; end;
  begin perform public.report_open_mat_payment(reference,repeat('f',64),'TEST');raise exception 'TEST_FAILURE_KEY_ACCESS'; exception when others then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
  replay:=public.report_open_mat_payment(reference,key_hash,'TEST-ONLY');
  assert replay->>'status'='reported_unverified', 'payment report stays unverified';
  replay:=public.report_open_mat_payment(reference,key_hash,'TEST-ONLY');
  assert replay->>'status'='reported_unverified', 'idempotent payment report';
  select * into job from public.claim_open_mat_emails(1);
  assert job.state='processing' and job.lease_token is not null, 'leased mail';
  assert not exists(select 1 from public.claim_open_mat_emails(50) where id=job.id), 'claimed job not repeated';
  assert not public.finish_open_mat_email(job.id,gen_random_uuid(),'sent','TEST-MESSAGE'), 'wrong lease rejected';
  ok:=public.finish_open_mat_email(job.id,job.lease_token,'sent','TEST-MESSAGE');
  assert ok, 'delivery recorded';
  assert not public.finish_open_mat_email(job.id,job.lease_token,'sent','TEST-MESSAGE'), 'finish cannot repeat';
  assert (select state='sent' and sent_at is not null from public.open_mat_notifications where id=job.id), 'sent state durable';
  update public.open_mat_notifications set lease_until=now()-interval '1 minute' where registration_reference=reference and state='processing';
  perform public.claim_open_mat_emails(50);
  assert exists(select 1 from public.open_mat_notifications where registration_reference=reference and state='uncertain'), 'expired lease never blindly resent';
end;
$$;
do $$ begin
  assert not has_table_privilege('anon','public.open_mat_registrations','select'), 'no anonymous reads';
  assert not has_table_privilege('authenticated','public.open_mat_registrations','select'), 'no direct member reads';
  assert not has_function_privilege('anon','public.register_open_mat(jsonb,text)','execute'), 'no public RPC intake';
  assert not has_function_privilege('authenticated','public.claim_open_mat_emails(integer)','execute'), 'no public email claims';
  assert (select bool_and(relrowsecurity) from pg_class where oid in ('public.open_mat_registrations'::regclass,'public.open_mat_notifications'::regclass)), 'RLS enabled';
end; $$;
rollback;
select 'Open-mat database validation passed; all synthetic registrations and messages rolled back.' as result;
