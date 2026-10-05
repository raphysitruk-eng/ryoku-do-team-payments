create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.team_payment_run_maintenance()
returns void
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  update public.team_payment_requests
  set request_status='expired',updated_at=v_now
  where expires_at<v_now
    and request_status in ('draft','sent','opened','form_completed','payment_pending')
    and payment_status not in ('active','finished','cancelled');

  delete from public.team_payment_rate_limits where window_start < v_now-interval '1 day';
  delete from public.team_payment_verification_sessions
    where expires_at < v_now-interval '1 day' or used_at < v_now-interval '1 day';
  update public.team_payment_provider_events set raw_payload='{}'::jsonb
    where received_at < v_now-interval '30 days' and raw_payload <> '{}'::jsonb;
  update public.team_payment_provider_secrets set active=false
    where active=true and expires_at is not null and expires_at < v_now;

  update public.team_payment_operational_alerts
  set status='resolved',resolved_at=v_now,last_seen_at=v_now
  where status='open' and alert_type in (
    'payment_pending_stale','provider_cancellation_pending',
    'provider_event_pending_mapping','provider_event_failed',
    'provider_event_unmatched','retention_review'
  );

  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,title,details,status,first_seen_at,last_seen_at,resolved_at)
  select 'payment_pending:'||r.id,'payment_pending_stale','warning',r.id,
         'טופס הושלם אך התשלום עדיין ממתין',
         jsonb_build_object('student_name',r.student_name,'form_completed_at',r.form_completed_at),
         'open',v_now,v_now,null
  from public.team_payment_requests r cross join public.team_payment_settings s
  where r.request_status='payment_pending'
    and r.form_completed_at is not null
    and r.form_completed_at < v_now - make_interval(hours=>s.payment_pending_attention_hours)
  on conflict (alert_key) do update
  set status='open',last_seen_at=excluded.last_seen_at,resolved_at=null,details=excluded.details,severity=excluded.severity,title=excluded.title;

  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,title,details,status,first_seen_at,last_seen_at,resolved_at)
  select 'provider_cancel:'||r.id,'provider_cancellation_pending','warning',r.id,
         'ביטול במערכת ממתין לביצוע אצל Invoice4U',
         jsonb_build_object('student_name',r.student_name,'requested_at',r.cancellation_requested_at),
         'open',v_now,v_now,null
  from public.team_payment_requests r
  where r.provider_cancellation_required=true
  on conflict (alert_key) do update
  set status='open',last_seen_at=excluded.last_seen_at,resolved_at=null,details=excluded.details;

  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,provider_event_id,title,details,status,first_seen_at,last_seen_at,resolved_at)
  select 'ipn_mapping:'||e.id,'provider_event_pending_mapping','warning',e.request_id,e.id,
         'IPN נקלט וממתין למיפוי/אימות',
         jsonb_build_object('event_type',e.event_type,'match_strategy',e.match_strategy,'received_at',e.received_at),
         'open',v_now,v_now,null
  from public.team_payment_provider_events e
  where e.source='ipn' and e.processing_status='received'
  on conflict (alert_key) do update
  set status='open',last_seen_at=excluded.last_seen_at,resolved_at=null,details=excluded.details;

  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,provider_event_id,title,details,status,first_seen_at,last_seen_at,resolved_at)
  select 'provider_failed:'||e.id,'provider_event_failed','critical',e.request_id,e.id,
         'אירוע תשלום נכשל בעיבוד',
         jsonb_build_object('event_type',e.event_type,'error',e.error_message,'received_at',e.received_at),
         'open',v_now,v_now,null
  from public.team_payment_provider_events e
  where e.processing_status='failed'
  on conflict (alert_key) do update
  set status='open',last_seen_at=excluded.last_seen_at,resolved_at=null,details=excluded.details;

  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,provider_event_id,title,details,status,first_seen_at,last_seen_at,resolved_at)
  select 'provider_unmatched:'||e.id,'provider_event_unmatched','warning',e.request_id,e.id,
         'אירוע תשלום לא הותאם לבקשה',
         jsonb_build_object('event_type',e.event_type,'match_strategy',e.match_strategy,'received_at',e.received_at),
         'open',v_now,v_now,null
  from public.team_payment_provider_events e
  where e.processing_status='unmatched'
  on conflict (alert_key) do update
  set status='open',last_seen_at=excluded.last_seen_at,resolved_at=null,details=excluded.details;

  insert into public.team_payment_operational_alerts(alert_key,alert_type,severity,request_id,title,details,status,first_seen_at,last_seen_at,resolved_at)
  select 'retention:'||r.id,'retention_review','info',r.id,
         'נדרשת בדיקת Retention / אנונימיזציה',
         jsonb_build_object('student_name',r.student_name,'billing_end_date',r.billing_end_date,'review_months',s.privacy_review_months),
         'open',v_now,v_now,null
  from public.team_payment_requests r cross join public.team_payment_settings s
  where r.request_status in ('completed','cancelled')
    and r.billing_end_date is not null
    and r.billing_end_date < current_date - make_interval(months=>s.privacy_review_months)
  on conflict (alert_key) do update
  set status='open',last_seen_at=excluded.last_seen_at,resolved_at=null,details=excluded.details;

  delete from cron.job_run_details where end_time is not null and end_time < v_now-interval '30 days';

  update public.team_payment_system_health
  set last_maintenance_at=v_now,last_maintenance_status='ok',last_maintenance_error=null,updated_at=v_now
  where id=1;
exception when others then
  update public.team_payment_system_health
  set last_maintenance_at=v_now,last_maintenance_status='error',
      last_maintenance_error=left(sqlerrm,1000),updated_at=v_now
  where id=1;
  raise;
end;
$$;

revoke all on function private.team_payment_run_maintenance() from public, anon, authenticated;
grant execute on function private.team_payment_run_maintenance() to postgres, service_role;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='team-payment-hourly-maintenance' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('team-payment-hourly-maintenance','17 * * * *','select private.team_payment_run_maintenance();');
