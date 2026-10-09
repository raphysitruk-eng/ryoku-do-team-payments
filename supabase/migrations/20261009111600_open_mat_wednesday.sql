-- Add Wednesday 20:30–22:30; preserve existing registrations and privileges.
CREATE OR REPLACE FUNCTION public.register_open_mat(p_payload jsonb, p_source_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if (p_payload->>'trainingDate')::date<today or extract(isodow from (p_payload->>'trainingDate')::date) not in (1,2,3) or p_payload->>'trainingTime'<'20:30' or p_payload->>'trainingTime'>='22:30' then raise exception 'INVALID_DATE'; end if;
  if p_payload->>'termsVersion'<>'2026-10-09.3' or p_payload->'consentSnapshot' is distinct from
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
    'שלום '||r.full_name||E',\n\nבקשתך לאימון מזרון פתוח באולם בית יחזקאל באשקלון התקבלה.\nקוד בקשה: '||r.reference||E'\nמועד מבוקש: '||session_text||E'\nעלות האימון: 30 ש״ח.\nחלון הפעילות: שני, שלישי ורביעי, 20:30–22:30. יש לסיים ולסגור עד 22:30.\n\nזהו אישור קבלת הבקשה בלבד. הוא אינו קבלה כספית, אישור תשלום או אישור כניסה לאולם. ההשתתפות מותנית באישור רפי למועד ולפתיחה ולסגירה, ובאימות התשלום.\n\nלתשלום: העבירו 30 ש״ח באפליקציית bit למספר 0547501888. ודאו את שם המקבל והוסיפו רק את קוד הבקשה לתיאור ההעברה. אין צורך להירשם או לשלם שוב אם כבר שילמתם.\n\nהאימון מיועד לבני 18 ומעלה בלבד ולתרגול עצמאי ללא מאמן. יש להגיע עם ביטוח תאונות אישיות מתאים, להחזיר מזרונים וציוד למקומם, ולוודא כיבוי אורות ומזגנים ונעילת האולם לפי ההרשאה וההנחיות. האחריות לנזקים תיקבע לפי הדין ולפי תנאי ההשתתפות שאישרתם.\n\nלתיאום או לתיקון פרטים: רפי, 0547501888.\nRyoku-Do — האקדמיה לקראטה'),
  (r.reference,'admin','raphy.sitruk@gmail.com','הרשמה חדשה למזרון פתוח | '||r.reference,
    E'התקבלה הרשמה חדשה לאימון מזרון פתוח באולם בית יחזקאל.\n\nקוד בקשה: '||r.reference||E'\nשם החניך/ה: '||r.full_name||E'\nמועד מבוקש: '||session_text||E'\nטלפון: '||r.phone||E'\nאימייל: '||r.email||E'\nמחיר: 30 ש״ח.\nמצב בעת ההרשמה: ממתין לתשלום ולאישור המועד.\n\nהחניך/ה הצהיר/ה על גיל 18 ומעלה ואישר/ה את תנאי ההשתתפות. התשלום טרם אומת.\nלצפייה בהזמנה ובמצב העדכני: https://raphysitruk-eng.github.io/ryoku-do-team-payments/admin.html\n\nמטעמי פרטיות, תעודת הזהות ותאריך הלידה אינם נכללים בהודעה.');
  delete from public.open_mat_intake_limits where window_start<now()-interval '2 days';
  return jsonb_build_object('reference',r.reference,'status',r.payment_status,'replayed',false);
end;
$function$
