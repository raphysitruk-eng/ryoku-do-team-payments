const out=document.getElementById('state');
const raw=new URLSearchParams(location.search).get('confirmation_url')||'';
try{
  const u=new URL(raw);
  const okHost=u.hostname.endsWith('.supabase.co');
  const okPath=u.pathname==='/auth/v1/verify';
  const okType=(u.searchParams.get('type')||'')==='recovery';
  if(!okHost||!okPath||!okType) throw new Error('bad');
  const p=document.createElement('p');
  p.textContent='הקישור מוכן. לחץ כדי להמשיך לאיפוס הסיסמה.';
  const a=document.createElement('a');
  a.className='btn gold';
  a.textContent='המשך לאיפוס הסיסמה';
  a.href=u.toString();
  a.rel='noreferrer';
  out.append(p,a);
}catch(e){
  out.innerHTML='<div class="err">קישור השחזור אינו תקין. בקש קישור חדש.</div>';
}
