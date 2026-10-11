create function public.report_grade_exam_payment(p_reference text, p_key_hash text, p_payment_reference text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.grade_exam_registrations%rowtype;
begin
  select * into v_row from public.grade_exam_registrations where reference=p_reference and request_key_hash=p_key_hash for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_row.registration_status='cancelled' then return jsonb_build_object('ok', false, 'code', 'CANCELLED'); end if;
  if v_row.payment_status='verified' then return jsonb_build_object('ok', true, 'registration', public.grade_exam_receipt(v_row)); end if;
  if v_row.payment_method='cash' then return jsonb_build_object('ok', false, 'code', 'CASH_PAYMENT'); end if;
  if p_payment_reference is null or length(trim(p_payment_reference)) not between 2 and 100 then return jsonb_build_object('ok', false, 'code', 'INVALID'); end if;
  if v_row.payment_status='reported_unverified' and v_row.payment_reference=trim(p_payment_reference) then return jsonb_build_object('ok', true, 'replayed', true, 'registration', public.grade_exam_receipt(v_row)); end if;
  update public.grade_exam_registrations set payment_status='reported_unverified',payment_reference=trim(p_payment_reference),payment_reported_at=now(),updated_at=clock_timestamp() where id=v_row.id returning * into v_row;
  insert into public.grade_exam_audit(registration_id,action) values(v_row.id,'payment_reported');
  return jsonb_build_object('ok', true, 'registration', public.grade_exam_receipt(v_row));
end;
$$;
revoke all on function public.report_grade_exam_payment(text,text,text) from public, anon, authenticated;
grant execute on function public.report_grade_exam_payment(text,text,text) to service_role;

create function public.admin_update_grade_exam(p_id uuid, p_actor uuid, p_expected_updated_at timestamptz, p_payment_status text, p_registration_status text, p_payment_confirmed boolean, p_note text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.grade_exam_registrations%rowtype; v_before jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and approval_status='approved') then return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
  if p_payment_status is null or p_payment_status not in ('awaiting_payment','reported_unverified','verified') or p_registration_status is null or p_registration_status not in ('pending','approved','cancelled') or p_note is null or length(trim(p_note)) not between 3 and 500 then return jsonb_build_object('ok', false, 'code', 'INVALID'); end if;
  select * into v_row from public.grade_exam_registrations where id=p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_expected_updated_at is null or v_row.updated_at<>p_expected_updated_at then return jsonb_build_object('ok', false, 'code', 'STALE_RECORD'); end if;
  if p_payment_status='verified' and v_row.payment_status<>'verified' and p_payment_confirmed is distinct from true then return jsonb_build_object('ok', false, 'code', 'PAYMENT_EVIDENCE_REQUIRED'); end if;
  if p_registration_status='approved' and p_payment_status<>'verified' then return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED'); end if;
  v_before:=jsonb_build_object('payment_status',v_row.payment_status,'registration_status',v_row.registration_status);
  update public.grade_exam_registrations set payment_status=p_payment_status,registration_status=p_registration_status,
    payment_verified_at=case when p_payment_status='verified' then coalesce(payment_verified_at,now()) else null end,
    payment_verified_by=case when p_payment_status='verified' then coalesce(payment_verified_by,p_actor) else null end,
    updated_at=clock_timestamp() where id=p_id returning * into v_row;
  insert into public.grade_exam_audit(registration_id,actor_id,action,details) values(p_id,p_actor,'admin_updated',jsonb_build_object('before',v_before,'after',jsonb_build_object('payment_status',p_payment_status,'registration_status',p_registration_status),'note',trim(p_note)));
  return jsonb_build_object('ok', true, 'registration', public.grade_exam_receipt(v_row));
end;
$$;
revoke all on function public.admin_update_grade_exam(uuid,uuid,timestamptz,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_update_grade_exam(uuid,uuid,timestamptz,text,text,boolean,text) to service_role;
