begin;
do $test$
declare
  fixture_request_id uuid;
  proof text;
  input jsonb;
  saved public.team_payment_consents%rowtype;
  request_row public.team_payment_requests%rowtype;
  child_id uuid;
  mode integer;
  student_type text;
  parent_type text;
begin
  for mode in 1..3 loop
    proof := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
    insert into public.team_payment_requests(token_hash,student_name,parent_name,parent_phone,parent_email,request_status)
    values(md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'Passport Fixture','Fixture Guardian','0500000001','fixture@example.test','sent')
    returning id into fixture_request_id;
    insert into public.team_payment_verification_sessions(request_id,proof_hash) values(fixture_request_id,proof);
    student_type := case when mode=3 then 'israeli_id' else 'passport' end;
    parent_type := case when mode=1 then 'passport' else 'israeli_id' end;
    input := jsonb_build_object(
      'student_id_number',case when mode=3 then '123456782' else '001AB23456789' end,
      'student_birth_date','2015-01-01','parent_name','Fixture Guardian',
      'parent_id_number',case when mode=1 then 'XY123456789012' else '123456782' end,
      'parent_relationship','אב','parent_phone','0500000001','parent_email','fixture@example.test',
      'health_confirmed',true,'team_rules_accepted',true,'payment_terms_accepted',true,
      'admin_only_changes_accepted',true,'no_auto_cancel_accepted',true,'privacy_accepted',true,
      'guardian_confirmed',true,'signature_name','Fixture Guardian'
    );
    if mode<>3 then input := input||jsonb_build_object('student_id_type',student_type,'parent_id_type',parent_type); end if;
    perform public.team_payment_submit_consent(fixture_request_id,input,null,'passport-sql-test',proof);
    select * into saved from public.team_payment_consents where team_payment_consents.request_id=fixture_request_id;
    select * into request_row from public.team_payment_requests where id=fixture_request_id;
    if saved.student_id_type<>student_type or saved.parent_id_type<>parent_type
      or saved.student_id_number<>input->>'student_id_number' or saved.parent_id_number<>input->>'parent_id_number'
      or request_row.student_id_type<>student_type or request_row.parent_id_type<>parent_type
      or request_row.student_id_number<>saved.student_id_number or request_row.parent_id_number<>saved.parent_id_number
      or request_row.request_status<>'payment_pending' or request_row.payment_status<>'not_started'
    then raise exception 'Typed registration was not preserved'; end if;
    if not exists(select 1 from public.team_payment_verification_sessions where proof_hash=proof and used_at is not null)
    then raise exception 'Verification proof was not consumed'; end if;
  end loop;

  insert into public.children(first_name,last_name,contact_phone,student_id_type,student_id_number)
  values('Passport','Fixture','0500000001','passport','001AB23456789') returning id into child_id;
  begin
    update public.children set student_id_type='israeli_id' where id=child_id;
    raise exception 'An Israeli ID type accepted passport characters';
  exception when check_violation then null;
  end;
  if (select student_id_number from public.children where id=child_id)<>'001AB23456789'
  then raise exception 'The child passport number changed'; end if;

  if has_table_privilege('anon','public.team_payment_consents','SELECT') or has_table_privilege('authenticated','public.team_payment_consents','SELECT')
    or has_function_privilege('anon','public.team_payment_submit_consent(uuid,jsonb,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.team_payment_submit_consent(uuid,jsonb,text,text,text)','EXECUTE')
  then raise exception 'Private consent access became public'; end if;
end;
$test$;
rollback;
select 'Passport, mixed documents, legacy IDs, child storage and privacy checks passed; all fixtures rolled back.' as result;
