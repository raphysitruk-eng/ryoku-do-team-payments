create function public.register_grade_exam_contact(p_payload jsonb, p_key_hash text, p_payload_hash text, p_identity_hash text, p_source_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.grade_exam_registrations%rowtype;
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
  v_year integer;
  v_season text;
  v_attempts integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' or p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;
  -- Serialize the same student/contact pair to make concurrent retries and deduplication atomic.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_identity_hash, 0));
  -- A successful retry is resolved before intake limits.
  select * into v_row from public.grade_exam_registrations where request_key_hash = p_key_hash;
  if found then
    if v_row.payload_hash <> p_payload_hash and jsonb_build_object('full_name',v_row.full_name,'registrant_kind',v_row.registrant_kind,'contact_name',v_row.contact_name,'contact_phone',v_row.contact_phone,'contact_email',v_row.contact_email,'group_name',v_row.group_name,'branch',v_row.branch,'current_rank',v_row.current_rank,'payment_method',v_row.payment_method,'accuracy_consent',v_row.accuracy_consent,'guardian_consent',v_row.guardian_consent,'consent_version',v_row.consent_version) <> p_payload then return jsonb_build_object('ok', false, 'code', 'KEY_CONFLICT'); end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'registration', public.grade_exam_receipt(v_row));
  end if;
  if coalesce(p_payload->>'full_name', '') = '' or length(p_payload->>'full_name') not between 2 and 100
    or coalesce(p_payload->>'registrant_kind', '') not in ('self','guardian')
    or coalesce(p_payload->>'group_name', '') not in ('beginners','advanced','youth','adults')
    or coalesce(p_payload->>'branch', '') not in ('herzog','agamim','waldberg')
    or coalesce(p_payload->>'current_rank', '') not in ('white','yellow','orange','green','blue')
    or coalesce(p_payload->>'payment_method', '') not in ('bit','paybox','cash')
    or coalesce(p_payload->>'contact_name', '') = '' or length(p_payload->>'contact_name') not between 2 and 100
    or coalesce(p_payload->>'contact_phone', '') !~ '^0(5[0-9]{8}|[23489][0-9]{7}|7[0-9]{8})$'
    or length(coalesce(p_payload->>'contact_email', '')) > 254
    or (coalesce(p_payload->>'contact_email', '') <> '' and p_payload->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or p_payload->>'accuracy_consent' is distinct from 'true'
    or p_payload->>'consent_version' is distinct from '2026-10-11.1' then
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;
  if p_payload->>'registrant_kind' = 'guardian' and p_payload->>'guardian_consent' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;
  v_year := extract(year from v_today)::integer - case when extract(month from v_today) < 9 then 1 else 0 end;
  v_season := v_year::text || '-' || right((v_year + 1)::text, 2);
  if exists (select 1 from public.grade_exam_registrations where (student_identity_hash=p_identity_hash or (lower(full_name)=lower(p_payload->>'full_name') and contact_phone=p_payload->>'contact_phone')) and exam_season=v_season and current_rank=p_payload->>'current_rank' and registration_status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_REGISTRATION');
  end if;
  insert into public.grade_exam_intake_limits(source_hash,hour_start) values(p_source_hash,date_trunc('hour',now()))
    on conflict (source_hash,hour_start) do update set attempts=public.grade_exam_intake_limits.attempts+1 returning attempts into v_attempts;
  if v_attempts > 20 then return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED'); end if;
  insert into public.grade_exam_registrations(request_key_hash,payload_hash,student_identity_hash,full_name,registrant_kind,contact_name,contact_phone,contact_email,group_name,branch,current_rank,exam_season,payment_method,accuracy_consent,guardian_consent,consent_version)
    values(p_key_hash,p_payload_hash,p_identity_hash,p_payload->>'full_name',p_payload->>'registrant_kind',p_payload->>'contact_name',p_payload->>'contact_phone',coalesce(p_payload->>'contact_email',''),p_payload->>'group_name',p_payload->>'branch',p_payload->>'current_rank',v_season,p_payload->>'payment_method',true,coalesce(p_payload->>'guardian_consent','false')::boolean,'2026-10-11.1')
    on conflict do nothing returning * into v_row;
  if not found then
    select * into v_row from public.grade_exam_registrations where request_key_hash=p_key_hash;
    if not found then return jsonb_build_object('ok', false, 'code', 'DUPLICATE_REGISTRATION'); end if;
    if v_row.payload_hash<>p_payload_hash and jsonb_build_object('full_name',v_row.full_name,'registrant_kind',v_row.registrant_kind,'contact_name',v_row.contact_name,'contact_phone',v_row.contact_phone,'contact_email',v_row.contact_email,'group_name',v_row.group_name,'branch',v_row.branch,'current_rank',v_row.current_rank,'payment_method',v_row.payment_method,'accuracy_consent',v_row.accuracy_consent,'guardian_consent',v_row.guardian_consent,'consent_version',v_row.consent_version) <> p_payload then return jsonb_build_object('ok', false, 'code', 'KEY_CONFLICT'); end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'registration', public.grade_exam_receipt(v_row));
  end if;
  insert into public.grade_exam_audit(registration_id,action,details) values(v_row.id,'registered',jsonb_build_object('payment_method',v_row.payment_method,'consent_version',v_row.consent_version));
  delete from public.grade_exam_intake_limits where hour_start < now() - interval '48 hours';
  return jsonb_build_object('ok', true, 'replayed', false, 'registration', public.grade_exam_receipt(v_row));
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or check_violation then
  return jsonb_build_object('ok', false, 'code', 'INVALID');
end;
$$;
revoke all on function public.register_grade_exam_contact(jsonb,text,text,text,text) from public, anon, authenticated;
grant execute on function public.register_grade_exam_contact(jsonb,text,text,text,text) to service_role;

