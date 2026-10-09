-- Independent adult open-mat intake. No Invoice4U billing changes.
create table public.open_mat_registrations (
  reference text primary key check(reference ~ '^OM-[A-F0-9]{12}$'),
  request_key_hash text not null unique check(request_key_hash ~ '^[a-f0-9]{64}$'),
  participant_session_hash text not null unique check(participant_session_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  full_name text not null check(length(full_name) between 3 and 100),
  national_id text not null check(national_id ~ '^[0-9]{9}$'),
  phone text not null check(phone ~ '^05[0-9]{8}$'),
  email text not null check(length(email) between 5 and 254 and email !~ '[[:space:]]'),
  birth_date date not null,
  training_date date not null,
  training_time text not null check(training_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  amount_agorot integer not null default 3000 check(amount_agorot=3000),
  terms_version text not null,
  terms_hash text not null check(terms_hash ~ '^[a-f0-9]{64}$'),
  consent_snapshot jsonb not null,
  booking_status text not null default 'pending_approval' check(booking_status in ('pending_approval','approved','cancelled')),
  payment_status text not null default 'awaiting_payment' check(payment_status in ('awaiting_payment','reported_unverified','verified')),
  payment_reference text not null default '' check(length(payment_reference)<=100),
  payment_reported_at timestamptz,
  created_at timestamptz not null default now()
);
create index open_mat_training_idx on public.open_mat_registrations(training_date,training_time);
create table public.open_mat_notifications (
  id uuid primary key default gen_random_uuid(),
  registration_reference text not null references public.open_mat_registrations(reference) on delete cascade,
  kind text not null check(kind in ('participant','admin')),
  recipient_email text not null,
  subject text not null,
  body_text text not null,
  state text not null default 'pending' check(state in ('pending','processing','sent','retry','blocked','uncertain')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(registration_reference,kind)
);
create index open_mat_pending_mail_idx on public.open_mat_notifications(next_attempt_at) where state in ('pending','retry');
create table public.open_mat_intake_limits (
  source_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 1,
  primary key(source_hash,window_start)
);
alter table public.open_mat_registrations enable row level security;
alter table public.open_mat_notifications enable row level security;
alter table public.open_mat_intake_limits enable row level security;
revoke all on public.open_mat_registrations,public.open_mat_notifications,public.open_mat_intake_limits from public,anon,authenticated;
grant select,insert,update,delete on public.open_mat_registrations,public.open_mat_notifications,public.open_mat_intake_limits to service_role;

create function public.register_open_mat(p_payload jsonb,p_source_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.open_mat_registrations;
  n integer;
  session_text text;
  today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if p_source_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SOURCE'; end if;
  select * into r from public.open_mat_registrations where request_key_hash=p_payload->>'requestKeyHash';
  if found then
    if r.payload_hash<>p_payload->>'payloadHash' then raise exception 'KEY_CONFLICT'; end if;
    return jsonb_build_object('reference',r.reference,'status',r.payment_status,'replayed',true);
  end if;
  if (p_payload->>'birthDate')::date>today-interval '18 years' or
     (p_payload->>'birthDate')::date<today-interval '120 years' then raise exception 'ADULTS_ONLY'; end if;
  if (p_payload->>'trainingDate')::date<today or extract(isodow from (p_payload->>'trainingDate')::date) not in (1,2) or p_payload->>'trainingTime'<'20:30' or p_payload->>'trainingTime'>='22:30' then raise exception 'INVALID_DATE'; end if;
  if p_payload->>'termsVersion'<>'2026-10-09.2' or p_payload->'consentSnapshot' is distinct from
     '{"adult":true,"hall":true,"equipment":true,"insurance":true,"termsAndPrivacy":true}'::jsonb then raise exception 'INVALID_CONSENT'; end if;
  insert into public.open_mat_intake_limits(source_hash,window_start) values(p_source_hash,date_trunc('hour',now()))
    on conflict(source_hash,window_start) do update set attempts=public.open_mat_intake_limits.attempts+1 returning attempts into n;
  if n>10 then return jsonb_build_object('error','RATE_LIMITED'); end if;
  insert into public.open_mat_registrations(reference,request_key_hash,participant_session_hash,payload_hash,full_name,national_id,phone,email,birth_date,training_date,training_time,terms_version,terms_hash,consent_snapshot)
  values(p_payload->>'reference',p_payload->>'requestKeyHash',p_payload->>'participantSessionHash',p_payload->>'payloadHash',p_payload->>'fullName',p_payload->>'nationalId',p_payload->>'phone',p_payload->>'email',(p_payload->>'birthDate')::date,(p_payload->>'trainingDate')::date,p_payload->>'trainingTime',p_payload->>'termsVersion',p_payload->>'termsHash',p_payload->'consentSnapshot')
    on conflict do nothing returning * into r;
  if not found then
    select * into r from public.open_mat_registrations where request_key_hash=p_payload->>'requestKeyHash';
    if found and r.payload_hash=p_payload->>'payloadHash' then return jsonb_build_object('reference',r.reference,'status',r.payment_status,'replayed',true); end if;
    raise exception 'DUPLICATE_SESSION';
  end if;
  session_text:=to_char(r.training_date,'DD.MM.YYYY')||' בשעה '||r.training_time;
  insert into public.open_mat_notifications(registration_reference,kind,recipient_email,subject,body_text) values
  (r.reference,'participant',r.email,'אישור קבלת הרשמה למזרון פתוח | '||r.reference,
    'שלום '||r.full_name||E',\n\nבקשתך לאימון מזרון פתוח באולם בית יחזקאל באשקלון התקבלה.\nקוד בקשה: '||r.reference||E'\nמועד מבוקש: '||session_text||E'\nעלות האימון: 30 ש״ח.\nחלון הפעילות: שני ושלישי, 20:30–22:30. יש לסיים ולסגור עד 22:30.\n\nזהו אישור קבלת הבקשה בלבד. הוא אינו קבלה כספית, אישור תשלום או אישור כניסה לאולם. ההשתתפות מותנית באישור רפי למועד ולפתיחה ולסגירה, ובאימות התשלום.\n\nלתשלום: העבירו 30 ש״ח באפליקציית bit למספר 0547501888. ודאו את שם המקבל והוסיפו רק את קוד הבקשה לתיאור ההעברה. אין צורך להירשם או לשלם שוב אם כבר שילמתם.\n\nהאימון מיועד לבני 18 ומעלה בלבד ולתרגול עצמאי ללא מאמן. יש להגיע עם ביטוח תאונות אישיות מתאים, להחזיר מזרונים וציוד למקומם, ולוודא כיבוי אורות ומזגנים ונעילת האולם לפי ההרשאה וההנחיות. האחריות לנזקים תיקבע לפי הדין ולפי תנאי ההשתתפות שאישרתם.\n\nלתיאום או לתיקון פרטים: רפי, 0547501888.\nRyoku-Do — האקדמיה לקראטה'),
  (r.reference,'admin','raphy.sitruk@gmail.com','הרשמה חדשה למזרון פתוח | '||r.reference,
    E'התקבלה הרשמה חדשה לאימון מזרון פתוח באולם בית יחזקאל.\n\nקוד בקשה: '||r.reference||E'\nשם החניך/ה: '||r.full_name||E'\nמועד מבוקש: '||session_text||E'\nטלפון: '||r.phone||E'\nאימייל: '||r.email||E'\nמחיר: 30 ש״ח.\nמצב בעת ההרשמה: ממתין לתשלום ולאישור המועד.\n\nהחניך/ה הצהיר/ה על גיל 18 ומעלה ואישר/ה את תנאי ההשתתפות. התשלום טרם אומת.\nלצפייה בהזמנה ובמצב העדכני: https://raphysitruk-eng.github.io/ryoku-do-team-payments/admin.html\n\nמטעמי פרטיות, תעודת הזהות ותאריך הלידה אינם נכללים בהודעה.');
  delete from public.open_mat_intake_limits where window_start<now()-interval '2 days';
  return jsonb_build_object('reference',r.reference,'status',r.payment_status,'replayed',false);
end;
$$;

create function public.report_open_mat_payment(p_reference text,p_key_hash text,p_payment_reference text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.open_mat_registrations;
begin
  if length(p_payment_reference)>100 or p_payment_reference ~ '[<>[:cntrl:]]' then raise exception 'INVALID_REFERENCE'; end if;
  update public.open_mat_registrations set payment_status='reported_unverified',payment_reference=p_payment_reference,payment_reported_at=now()
    where reference=p_reference and request_key_hash=p_key_hash and payment_status='awaiting_payment' returning * into r;
  if not found then select * into r from public.open_mat_registrations where reference=p_reference and request_key_hash=p_key_hash; end if;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('status',r.payment_status);
end;
$$;

create function public.claim_open_mat_emails(p_limit integer default 20)
returns setof public.open_mat_notifications language plpgsql security invoker set search_path='' as $$
begin
  -- An expired lease could already have sent. Never resend it blindly.
  update public.open_mat_notifications set state='uncertain',last_error_code='LEASE_EXPIRED',updated_at=now()
    where state='processing' and lease_until<now();
  return query with candidates as (
    select id from public.open_mat_notifications where state in ('pending','retry') and next_attempt_at<=now()
      order by created_at,id limit least(50,greatest(1,p_limit)) for update skip locked
  ) update public.open_mat_notifications n set state='processing',attempts=n.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '45 minutes',updated_at=now()
    from candidates c where n.id=c.id returning n.*;
end;
$$;

create function public.finish_open_mat_email(p_id uuid,p_lease uuid,p_state text,p_message_id text default null,p_error_code text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_state not in ('sent','retry','blocked','uncertain') then raise exception 'INVALID_STATE'; end if;
  if p_state='sent' and coalesce(length(p_message_id),0)=0 then raise exception 'MESSAGE_ID_REQUIRED'; end if;
  update public.open_mat_notifications set state=case when p_state='retry' and attempts>=5 then 'blocked' else p_state end,
    provider_message_id=case when p_state='sent' then left(p_message_id,200) else provider_message_id end,
    sent_at=case when p_state='sent' then now() else sent_at end,
    last_error_code=left(p_error_code,80),lease_token=null,lease_until=null,next_attempt_at=now()+interval '1 hour',updated_at=now()
    where id=p_id and lease_token=p_lease and state='processing';
  get diagnostics n=row_count;
  return n=1;
end;
$$;
revoke execute on function public.register_open_mat(jsonb,text),public.report_open_mat_payment(text,text,text),public.claim_open_mat_emails(integer),public.finish_open_mat_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_open_mat(jsonb,text),public.report_open_mat_payment(text,text,text),public.claim_open_mat_emails(integer),public.finish_open_mat_email(uuid,uuid,text,text,text) to service_role;
