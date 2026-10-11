-- Synthetic booking only. All writes, verification and audit entries are rolled back.
begin;
do $$
declare v_actor uuid; v_row public.open_mat_registrations%rowtype; v_result jsonb; v_old timestamptz; v_verified timestamptz;
begin
  assert not has_function_privilege('anon','public.admin_update_open_mat(text,uuid,timestamptz,text,text,boolean,text)','execute');
  assert not has_function_privilege('authenticated','public.admin_update_open_mat(text,uuid,timestamptz,text,text,boolean,text)','execute');
  assert has_function_privilege('service_role','public.admin_update_open_mat(text,uuid,timestamptz,text,text,boolean,text)','execute');
  select id into v_actor from public.profiles where role='admin' and approval_status='approved' limit 1;
  assert v_actor is not null, 'An approved administrator is required for the synthetic fixture';
  insert into public.open_mat_registrations(reference,request_key_hash,participant_session_hash,payload_hash,full_name,national_id,phone,email,birth_date,training_date,training_time,terms_version,terms_hash,consent_snapshot)
  values('OM-000000000000',repeat('1',64),repeat('2',64),repeat('3',64),'QA Fixture','123456782','0500000000','qa@example.invalid','1990-01-01',current_date+1,'20:30','2026-10-09.3',repeat('4',64),'{}') returning * into v_row;
  v_old:=v_row.updated_at;
  v_result:=public.admin_update_open_mat(v_row.reference,gen_random_uuid(),v_old,'verified','approved',true,'QA fixture only');
  assert v_result->>'code'='UNAUTHORIZED';
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_old,'verified','approved',false,'QA fixture only');
  assert v_result->>'code'='PAYMENT_EVIDENCE_REQUIRED';
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_old,'awaiting_payment','approved',false,'QA fixture only');
  assert v_result->>'code'='PAYMENT_REQUIRED';
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_old,'verified','approved',true,'');
  assert v_result->>'code'='INVALID';
  assert (select count(*) from public.open_mat_audit where registration_reference=v_row.reference)=0;
  perform public.report_open_mat_payment(v_row.reference,repeat('1',64),'QA reference');
  select * into v_row from public.open_mat_registrations where reference=v_row.reference;
  assert v_row.updated_at>v_old, 'Participant reporting must invalidate a stale admin form';
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_old,'verified','approved',true,'QA fixture only');
  assert v_result->>'code'='STALE_RECORD';
  v_old:=v_row.updated_at;
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_old,'verified','approved',true,'QA fixture only');
  assert (v_result->>'ok')::boolean;
  select * into v_row from public.open_mat_registrations where reference=v_row.reference;
  assert v_row.payment_status='verified' and v_row.booking_status='approved';
  assert v_row.payment_verified_at is not null and v_row.payment_verified_by=v_actor;
  v_verified:=v_row.payment_verified_at;
  assert (select count(*) from public.open_mat_audit where registration_reference=v_row.reference)=1;
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_old,'verified','cancelled',false,'QA cancellation only');
  assert v_result->>'code'='STALE_RECORD';
  v_result:=public.admin_update_open_mat(v_row.reference,v_actor,v_row.updated_at,'verified','cancelled',false,'QA cancellation only');
  assert (v_result->>'ok')::boolean;
  select * into v_row from public.open_mat_registrations where reference=v_row.reference;
  assert v_row.booking_status='cancelled' and v_row.payment_status='verified';
  assert v_row.payment_verified_at=v_verified;
  assert (select count(*) from public.open_mat_audit where registration_reference=v_row.reference)=2;
  assert (select count(*) from public.open_mat_notifications where registration_reference=v_row.reference)=0, 'Admin changes must not send or queue test email';
end;
$$;
rollback;
select 'Passed: permissions, evidence, approval, public reporting, stale edits, audit and cancellation; fixture rolled back' as result,
  (select count(*) from public.open_mat_registrations where reference='OM-000000000000') as remaining_test_rows;
