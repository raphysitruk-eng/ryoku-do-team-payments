insert into public.team_payment_terms_versions(version,content_hash,source_url,effective_at)
values(
  'team-2026-10-v2',
  '864c441c774dcde8730de9d356e6c5cafb45867041ccd177acdd9893d7276033',
  'https://raphysitruk-eng.github.io/ryoku-do-team-payments/terms.html',
  now()
)
on conflict (version) do update
set content_hash=excluded.content_hash,source_url=excluded.source_url;

update public.team_payment_settings
set terms_version='team-2026-10-v2',updated_at=now()
where id=1;

update public.team_payment_requests r
set terms_version='team-2026-10-v2',
    terms_content_hash='864c441c774dcde8730de9d356e6c5cafb45867041ccd177acdd9893d7276033',
    updated_at=now()
where not exists (select 1 from public.team_payment_consents c where c.request_id=r.id);
