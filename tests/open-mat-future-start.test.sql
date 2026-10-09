-- Run only after open_mat_future_start has been applied.
-- The entire transaction rolls back. No email is sent or marked sent.
begin;
do $$
declare
  key_hash text := md5(random()::text)||md5(random()::text);
  payload_hash text := md5(random()::text)||md5(random()::text);
  session_hash text := md5(random()::text)||md5(random()::text);
  ref text := 'OM-'||upper(substr(md5(random()::text),1,12));
  result jsonb;
begin
  assert public.open_mat_start_is_future('2026-10-12','20:30','2026-10-12 17:29:59+00'), 'summer: before start';
  assert not public.open_mat_start_is_future('2026-10-12','20:30','2026-10-12 17:30:00+00'), 'summer: exact start';
  assert not public.open_mat_start_is_future('2026-10-12','20:30','2026-10-12 17:31:00+00'), 'summer: already started';
  assert public.open_mat_start_is_future('2026-10-26','20:30','2026-10-26 18:29:59+00'), 'winter: before start';
  assert not public.open_mat_start_is_future('2026-10-26','20:30','2026-10-26 18:30:00+00'), 'winter: exact start';
  assert public.open_mat_start_is_future('2026-10-13','20:30','2026-10-12 21:05:00+00'), 'Israel midnight';
  insert into public.open_mat_registrations(reference,request_key_hash,participant_session_hash,payload_hash,full_name,national_id,phone,email,birth_date,training_date,training_time,terms_version,terms_hash,consent_snapshot)
  values(ref,key_hash,session_hash,payload_hash,'מתאמן בדיקה','123456782','0500000000','test@example.invalid','1990-01-01','2000-01-03','20:30','2026-10-09.3',repeat('a',64),'{"adult":true,"hall":true,"equipment":true,"insurance":true,"termsAndPrivacy":true}');
  result := public.register_open_mat(jsonb_build_object('requestKeyHash',key_hash,'payloadHash',payload_hash),repeat('b',64));
  assert (result->>'replayed')::boolean and result->>'reference'=ref, 'saved request replays after its start';
  assert result->>'status'='awaiting_payment', 'replay does not verify payment';
  assert not exists(select 1 from public.open_mat_notifications where registration_reference=ref), 'replay cannot enqueue another notification';
  begin
    perform public.register_open_mat(jsonb_build_object('requestKeyHash',repeat('f',64),'payloadHash',repeat('e',64),'trainingDate','2000-01-03','trainingTime','20:30'),repeat('b',64));
    raise exception 'TEST_FAILURE_PAST_START';
  exception when others then
    if sqlerrm <> 'INVALID_DATE' then raise; end if;
  end;
  assert not has_function_privilege('anon','public.open_mat_start_is_future(date,text,timestamp with time zone)','execute'), 'helper is not a public RPC';
  assert not has_function_privilege('authenticated','public.register_open_mat(jsonb,text)','execute'), 'intake remains server only';
end;
$$;
rollback;
select 'Future-start and replay checks passed; synthetic records rolled back.' as result;
