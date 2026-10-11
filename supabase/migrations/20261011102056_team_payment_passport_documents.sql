-- Add typed identity documents while preserving existing Israeli ID records.
alter table public.children add column if not exists student_id_type text not null default 'israeli_id';
alter table public.team_payment_requests
  add column if not exists student_id_type text not null default 'israeli_id',
  add column if not exists parent_id_type text not null default 'israeli_id';
alter table public.team_payment_consents
  add column if not exists student_id_type text not null default 'israeli_id',
  add column if not exists parent_id_type text not null default 'israeli_id';
alter table public.children drop constraint if exists children_student_id_format;
alter table public.children add constraint children_student_id_format check (
  student_id_type in ('israeli_id','passport') and (
    student_id_number is null
    or (student_id_type='israeli_id' and student_id_number ~ '^[0-9]{9}$')
    or (student_id_type='passport' and student_id_number ~ '^[A-Z0-9]{5,20}$')
  )
);
alter table public.team_payment_consents add constraint team_payment_consents_document_types check (
  student_id_type in ('israeli_id','passport') and parent_id_type in ('israeli_id','passport')
);
alter table public.team_payment_requests add constraint team_payment_requests_document_types check (
  student_id_type in ('israeli_id','passport') and parent_id_type in ('israeli_id','passport')
);

CREATE OR REPLACE FUNCTION public.team_payment_submit_consent(p_request_id uuid, p_consent jsonb, p_ip_hash text, p_user_agent text, p_verification_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.team_payment_requests%rowtype;
  now_ts timestamptz := now();
  phone_norm text;
  email_norm text;
  verification_id uuid;
begin
  select * into r
  from public.team_payment_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.request_status in ('cancelled','completed','expired') or r.expires_at<now_ts then
    raise exception 'REQUEST_INACTIVE';
  end if;

  select id into verification_id
  from public.team_payment_verification_sessions
  where request_id=p_request_id
    and proof_hash=p_verification_hash
    and used_at is null
    and expires_at>now_ts
  order by created_at desc
  limit 1
  for update;

  if verification_id is null then raise exception 'VERIFICATION_REQUIRED'; end if;

  if coalesce((p_consent->>'health_confirmed')::boolean,false)=false
     or coalesce((p_consent->>'team_rules_accepted')::boolean,false)=false
     or coalesce((p_consent->>'payment_terms_accepted')::boolean,false)=false
     or coalesce((p_consent->>'admin_only_changes_accepted')::boolean,false)=false
     or coalesce((p_consent->>'no_auto_cancel_accepted')::boolean,false)=false
     or coalesce((p_consent->>'privacy_accepted')::boolean,false)=false
     or coalesce((p_consent->>'guardian_confirmed')::boolean,false)=false then
    raise exception 'CONSENT_REQUIRED';
  end if;

  phone_norm := regexp_replace(coalesce(p_consent->>'parent_phone',''),'\D','','g');
  if phone_norm like '972%' then phone_norm := '0'||substr(phone_norm,4); end if;
  email_norm := lower(trim(coalesce(p_consent->>'parent_email','')));

  insert into public.team_payment_consents(
    request_id,student_id_type,student_id_number,student_birth_date,parent_name,parent_id_type,parent_id_number,parent_relationship,
    parent_phone,parent_email,emergency_name,emergency_relationship,emergency_phone,
    health_has_issue,health_notes,medications,allergies,respiratory_notes,orthopedic_notes,special_instructions,
    health_confirmed,photo_permission,terms_version,terms_content_hash,terms_accepted,team_rules_accepted,
    payment_terms_accepted,admin_only_changes_accepted,no_auto_cancel_accepted,privacy_accepted,privacy_version,
    guardian_confirmed,signature_name,source_ip_hash,user_agent,extra_details,updated_at
  ) values (
    p_request_id,
    coalesce(p_consent->>'student_id_type','israeli_id'),
    coalesce(p_consent->>'student_id_number',''),
    nullif(p_consent->>'student_birth_date','')::date,
    coalesce(p_consent->>'parent_name',''),
    coalesce(p_consent->>'parent_id_type','israeli_id'),
    coalesce(p_consent->>'parent_id_number',''),
    coalesce(p_consent->>'parent_relationship',''),
    coalesce(p_consent->>'parent_phone',''),
    coalesce(p_consent->>'parent_email',''),
    coalesce(p_consent->>'emergency_name',''),
    coalesce(p_consent->>'emergency_relationship',''),
    coalesce(p_consent->>'emergency_phone',''),
    coalesce((p_consent->>'health_has_issue')::boolean,false),
    coalesce(p_consent->>'health_notes',''),
    coalesce(p_consent->>'medications',''),
    coalesce(p_consent->>'allergies',''),
    coalesce(p_consent->>'respiratory_notes',''),
    coalesce(p_consent->>'orthopedic_notes',''),
    coalesce(p_consent->>'special_instructions',''),
    true,
    coalesce((p_consent->>'photo_permission')::boolean,false),
    r.terms_version,
    r.terms_content_hash,
    true,true,true,true,true,true,
    coalesce(p_consent->>'privacy_version','privacy-2026-09-v1'),
    true,
    coalesce(p_consent->>'signature_name',''),
    p_ip_hash,
    left(coalesce(p_user_agent,''),500),
    coalesce(p_consent->'extra_details','{}'::jsonb),
    now_ts
  )
  on conflict (request_id) do update set
    student_id_type=excluded.student_id_type,
    student_id_number=excluded.student_id_number,
    student_birth_date=excluded.student_birth_date,
    parent_name=excluded.parent_name,
    parent_id_type=excluded.parent_id_type,
    parent_id_number=excluded.parent_id_number,
    parent_relationship=excluded.parent_relationship,
    parent_phone=excluded.parent_phone,
    parent_email=excluded.parent_email,
    emergency_name=excluded.emergency_name,
    emergency_relationship=excluded.emergency_relationship,
    emergency_phone=excluded.emergency_phone,
    health_has_issue=excluded.health_has_issue,
    health_notes=excluded.health_notes,
    medications=excluded.medications,
    allergies=excluded.allergies,
    respiratory_notes=excluded.respiratory_notes,
    orthopedic_notes=excluded.orthopedic_notes,
    special_instructions=excluded.special_instructions,
    health_confirmed=excluded.health_confirmed,
    photo_permission=excluded.photo_permission,
    terms_version=excluded.terms_version,
    terms_content_hash=excluded.terms_content_hash,
    terms_accepted=excluded.terms_accepted,
    team_rules_accepted=excluded.team_rules_accepted,
    payment_terms_accepted=excluded.payment_terms_accepted,
    admin_only_changes_accepted=excluded.admin_only_changes_accepted,
    no_auto_cancel_accepted=excluded.no_auto_cancel_accepted,
    privacy_accepted=excluded.privacy_accepted,
    privacy_version=excluded.privacy_version,
    guardian_confirmed=excluded.guardian_confirmed,
    signature_name=excluded.signature_name,
    source_ip_hash=excluded.source_ip_hash,
    user_agent=excluded.user_agent,
    extra_details=excluded.extra_details,
    updated_at=now_ts;

  update public.team_payment_requests
  set student_id_type=coalesce(p_consent->>'student_id_type','israeli_id'),
      parent_id_type=coalesce(p_consent->>'parent_id_type','israeli_id'),
      student_id_number=coalesce(p_consent->>'student_id_number',''),
      student_birth_date=nullif(p_consent->>'student_birth_date','')::date,
      parent_id_number=coalesce(p_consent->>'parent_id_number',''),
      parent_name=coalesce(p_consent->>'parent_name',''),
      parent_phone=coalesce(p_consent->>'parent_phone',''),
      parent_email=coalesce(p_consent->>'parent_email',''),
      parent_phone_normalized=phone_norm,
      parent_email_normalized=email_norm,
      request_status='payment_pending',
      form_completed_at=coalesce(form_completed_at,now_ts),
      updated_at=now_ts
  where id=p_request_id;

  update public.team_payment_verification_sessions
  set used_at=now_ts
  where id=verification_id;

  insert into public.team_payment_audit_log(request_id,actor_type,action,details)
  values(p_request_id,'parent','form_completed',jsonb_build_object(
    'terms_version',r.terms_version,'terms_content_hash',r.terms_content_hash,
    'verification_session',verification_id
  ));

  return jsonb_build_object(
    'request_id',p_request_id,
    'checkout_url',r.provider_checkout_url,
    'terms_version',r.terms_version,
    'terms_content_hash',r.terms_content_hash
  );
end;
$function$;

-- Grants and RLS stay governed by the existing payment and parent portal policies.

