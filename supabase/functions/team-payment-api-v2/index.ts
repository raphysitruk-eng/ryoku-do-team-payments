
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const PROJECT_URL = "https://zwgpvwxdofjidshsiaek.supabase.co";
const DEFAULT_CHECKOUT_URL = "https://private.invoice4u.co.il/newsite/he/clearing/public/i4u-clearing?ProductGuid=36e1e4a3-9aca-431d-8b14-ae1de1519a19";
const enc = new TextEncoder();

function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {status, headers:{
    "Content-Type":"application/json; charset=UTF-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "X-Content-Type-Options":"nosniff"
  }});
}
function svc() {
  const packed=Deno.env.get("SUPABASE_SECRET_KEYS");
  const keys=packed?JSON.parse(packed):{};
  const key=keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key) throw new Error("server credential missing");
  return createClient(Deno.env.get("SUPABASE_URL")||PROJECT_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function digest(v:string) {
  const b=await crypto.subtle.digest("SHA-256",enc.encode(v));
  return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
}
function makeToken() {
  const b=new Uint8Array(32); crypto.getRandomValues(b);
  return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
}
function normPhone(v:unknown) {
  let x=String(v||"").replace(/\D/g,"");
  if(x.startsWith("972")) x="0"+x.slice(3);
  return x;
}
function validHttps(v:unknown) {
  const s=String(v||"").trim();
  if(!s) return true;
  try {
    const u=new URL(s);
    return u.protocol==="https:" && (u.hostname==="invoice4u.co.il" || u.hostname.endsWith(".invoice4u.co.il"));
  } catch { return false; }
}
function validEmail(v:unknown) {
  const s=String(v||"").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length<=254;
}
function validIsraeliId(v:unknown) {
  let s=String(v||"").replace(/\D/g,"");
  if(!/^\d{5,9}$/.test(s)) return false;
  s=s.padStart(9,"0");
  let sum=0;
  for(let i=0;i<9;i++){let n=Number(s[i])*(i%2===0?1:2);if(n>9)n-=9;sum+=n;}
  return sum%10===0;
}
function validBirthDate(v:unknown) {
  const s=String(v||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d=new Date(s+"T00:00:00Z");
  if(Number.isNaN(d.getTime())||d.getUTCFullYear()<1910||d.getTime()>Date.now()) return false;
  const age=(Date.now()-d.getTime())/(365.2425*86400000);
  return age>=3 && age<=110;
}
async function settings(s:any) {
  const {data,error}=await s.from("team_payment_settings").select("*").eq("id",1).single();
  if(error||!data) throw error||new Error("settings missing");
  return data;
}
async function termsHash(s:any,version:string) {
  const {data}=await s.from("team_payment_terms_versions").select("content_hash").eq("version",version).maybeSingle();
  return data?.content_hash||null;
}
function clientIp(req:Request) {
  return (req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"").split(",")[0].trim();
}
async function allowVerifyAttempt(s:any, rawToken:string, ip:string) {
  const key=await digest("verify:"+rawToken+":"+ip);
  const windowMs=15*60*1000;
  const windowStart=new Date(Math.floor(Date.now()/windowMs)*windowMs).toISOString();
  const {data:r}=await s.from("team_payment_rate_limits").select("attempts").eq("key_hash",key).eq("window_start",windowStart).maybeSingle();
  const attempts=Number(r?.attempts||0);
  if(attempts>=8) return false;
  if(r) await s.from("team_payment_rate_limits").update({attempts:attempts+1}).eq("key_hash",key).eq("window_start",windowStart);
  else await s.from("team_payment_rate_limits").insert({key_hash:key,window_start:windowStart,attempts:1});
  return true;
}
function jwtPayload(raw:string){
  try{
    const part=raw.split(".")[1]||"";
    const b64=part.replace(/-/g,"+").replace(/_/g,"/");
    const padded=b64+"=".repeat((4-b64.length%4)%4);
    return JSON.parse(atob(padded));
  }catch{return null}
}
async function admin(req:Request) {
  const raw=(req.headers.get("authorization")||"").replace(/^Bearer\s+/,"");
  if(!raw) return null;
  const s=svc();
  const {data:{user}}=await s.auth.getUser(raw);
  if(!user) return null;
  const claims=jwtPayload(raw);
  if(claims?.aal!=="aal2") return null;
  const {data:p}=await s.from("profiles").select("id,role,approval_status").eq("id",user.id).maybeSingle();
  return p?.role==="admin" && p?.approval_status==="approved" ? user : null;
}
async function log(s:any,id:string|null,actor_type:string,action:string,actor_id:string|null=null,details:any={}) {
  try { await s.from("team_payment_audit_log").insert({request_id:id,actor_type,actor_id,action,details}); } catch {}
}
function statusLabel(v:string) {
  const m:Record<string,string>={draft:"טיוטה",sent:"נשלח",opened:"נפתח",form_completed:"טופס הושלם",payment_pending:"ממתין לתשלום",completed:"הושלם",expired:"פג תוקף",cancelled:"בוטל"};
  return m[v]||v;
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:{
    "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, content-type, apikey, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"
  }});
  if(req.method!=="POST") return out({ok:false,code:"METHOD_NOT_ALLOWED"},405);

  try {
    const input=await req.json();
    const s=svc();

    if(input.action==="admin_list") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const page=Math.max(1,Math.floor(Number(input.page||1)));
      const pageSize=Math.min(100,Math.max(10,Math.floor(Number(input.page_size||50))));
      const from=(page-1)*pageSize,to=from+pageSize-1;
      const q=String(input.search||"").trim().replace(/[%_,()]/g," ").replace(/\s+/g," ").slice(0,80);
      let query=s.from("team_payment_requests")
        .select("id,student_name,parent_name,parent_phone,parent_email,branch,group_name,amount_agorot,request_status,payment_status,billing_start_date,billing_end_date,number_of_cycles,provider_checkout_url,provider_customer_id,provider_recurring_id,provider_last_transaction_id,provider_last_event_id,provider_last_synced_at,provider_sync_source,child_id,parent_profile_id,cancellation_requested_at,provider_cancellation_required,provider_cancellation_confirmed_at,terms_version,terms_content_hash,parent_note,internal_note,expires_at,sent_at,first_opened_at,form_completed_at,completed_at,cancelled_at,created_at",{count:"exact"})
        .order("created_at",{ascending:false}).range(from,to);
      if(q) query=query.or("student_name.ilike.%"+q+"%,parent_name.ilike.%"+q+"%,parent_phone.ilike.%"+q+"%,parent_email.ilike.%"+q+"%");
      const {data,error,count}=await query;
      if(error) throw error;
      return out({ok:true,requests:data||[],page,page_size:pageSize,total:count||0,total_pages:Math.max(1,Math.ceil((count||0)/pageSize))});
    }

    if(input.action==="admin_summary") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const {data,error}=await s.from("team_payment_requests").select("request_status,payment_status,amount_agorot").limit(5000);
      if(error) throw error;
      const rows=data||[];
      const active=rows.filter((r:any)=>r.payment_status==="active");
      return out({ok:true,summary:{
        all:rows.length,
        pending:rows.filter((r:any)=>!["completed","cancelled","expired"].includes(r.request_status)).length,
        active:active.length,
        monthly_agorot:active.reduce((n:number,r:any)=>n+Number(r.amount_agorot||0),0)
      }});
    }

    if(input.action==="admin_detail") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const {data:r,error}=await s.from("team_payment_requests").select("*").eq("id",input.id).maybeSingle();
      if(error||!r) return out({ok:false,code:"NOT_FOUND"},404);
      const {data:c}=await s.from("team_payment_consents").select("*").eq("request_id",input.id).maybeSingle();
      const [{data:logs},{data:events}]=await Promise.all([
        s.from("team_payment_audit_log").select("actor_type,action,details,created_at").eq("request_id",input.id).order("created_at",{ascending:false}).limit(50),
        s.from("team_payment_provider_events").select("event_type,payment_status,match_strategy,provider_transaction_id,provider_recurring_id,source,processing_status,error_message,verification_status,received_at,processed_at").eq("request_id",input.id).order("received_at",{ascending:false}).limit(30)
      ]);
      return out({ok:true,request:r,consent:c,audit:logs||[],provider_events:events||[]});
    }

    if(input.action==="admin_people") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const {data:children,error}=await s.from("children").select("id,parent_id,first_name,last_name,branch,group_name,active").eq("active",true).order("first_name",{ascending:true}).limit(500);
      if(error) throw error;
      const parentIds=[...new Set((children||[]).map((c:any)=>c.parent_id).filter(Boolean))];
      let profiles:any[]=[];
      if(parentIds.length){const {data:p}=await s.from("profiles").select("id,full_name,phone,email").in("id",parentIds);profiles=p||[];}
      const pm=new Map(profiles.map((p:any)=>[p.id,p]));
      return out({ok:true,people:(children||[]).map((c:any)=>({child_id:c.id,student_name:(c.first_name+" "+c.last_name).trim(),branch:c.branch,group_name:c.group_name,parent_profile_id:c.parent_id,parent:pm.get(c.parent_id)||null}))});
    }

    if(input.action==="admin_attention") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const [{data:alerts},{data:health}]=await Promise.all([
        s.from("team_payment_operational_alerts")
          .select("id,alert_key,alert_type,severity,request_id,provider_event_id,title,details,status,first_seen_at,last_seen_at")
          .eq("status","open").order("severity",{ascending:true}).order("last_seen_at",{ascending:false}).limit(200),
        s.from("team_payment_system_health").select("last_maintenance_at,last_maintenance_status,last_maintenance_error,updated_at").eq("id",1).maybeSingle()
      ]);
      const stale=!health?.last_maintenance_at || (Date.now()-new Date(health.last_maintenance_at).getTime()>2.5*3600000);
      return out({ok:true,attention:{alerts:alerts||[],health:health||null,health_stale:stale,count:(alerts||[]).length+(stale?1:0)}});
    }

    if(input.action==="admin_settings") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const cfg=await settings(s);
      return out({ok:true,settings:cfg,terms_content_hash:await termsHash(s,cfg.terms_version)});
    }

    if(input.action==="admin_bulk_create") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const rows=Array.isArray(input.rows)?input.rows:[];
      if(!rows.length||rows.length>100) return out({ok:false,code:"INVALID_ROWS"},400);
      const cfg=await settings(s),termHash=await termsHash(s,cfg.terms_version),now=new Date().toISOString();
      const {data:existing}=await s.from("team_payment_requests")
        .select("student_name,parent_phone_normalized,season_label")
        .eq("season_label",cfg.season_label).limit(5000);
      const keys=new Set((existing||[]).map((r:any)=>String(r.student_name||"").trim().toLowerCase()+"|"+String(r.parent_phone_normalized||"")));
      const inserts:any[]=[],tokens:any[]=[],errors:any[]=[],batchKeys=new Set<string>();
      for(let idx=0;idx<rows.length;idx++){
        const x=rows[idx]||{};
        const studentName=String(x.student_name||"").trim(),parentName=String(x.parent_name||"").trim();
        const parentPhone=String(x.parent_phone||"").trim(),phoneNorm=normPhone(parentPhone);
        const parentEmail=String(x.parent_email||"").trim().toLowerCase();
        const key=studentName.toLowerCase()+"|"+phoneNorm;
        if(!studentName||!parentName||phoneNorm.length<9||(parentEmail&&!validEmail(parentEmail))){
          errors.push({row:idx+1,code:"INVALID_INPUT",student_name:studentName}); continue;
        }
        if(keys.has(key)||batchKeys.has(key)){errors.push({row:idx+1,code:"DUPLICATE",student_name:studentName});continue;}
        batchKeys.add(key);
        const raw=makeToken(),hash=await digest(raw),id=crypto.randomUUID();
        inserts.push({
          id,token_hash:hash,student_name:studentName,branch:String(x.branch||""),group_name:String(x.group_name||""),
          parent_name:parentName,parent_phone:parentPhone,parent_email:parentEmail,
          parent_phone_normalized:phoneNorm,parent_email_normalized:parentEmail,
          amount_agorot:cfg.monthly_amount_agorot,billing_start_date:cfg.billing_start_date,billing_end_date:cfg.billing_end_date,
          number_of_cycles:cfg.number_of_cycles,provider_checkout_url:cfg.provider_checkout_url,
          terms_version:cfg.terms_version,terms_content_hash:termHash,season_label:cfg.season_label,
          cancellation_notice_days:cfg.cancellation_notice_days,price_change_notice_days:cfg.price_change_notice_days,
          expires_at:new Date(Date.now()+Number(cfg.link_expiry_days||14)*86400000).toISOString(),
          request_status:"sent",payment_status:"not_started",sent_at:now,created_by:a.id,
          parent_note:String(x.parent_note||""),internal_note:String(x.internal_note||"")
        });
        tokens.push({id,token:raw,student_name:studentName,parent_name:parentName,parent_phone:parentPhone,parent_email:parentEmail});
      }
      if(inserts.length){
        const {error}=await s.from("team_payment_requests").insert(inserts);
        if(error) throw error;
        await s.from("team_payment_audit_log").insert(inserts.map((r:any)=>({
          request_id:r.id,actor_type:"admin",actor_id:a.id,action:"bulk_created",details:{season_label:cfg.season_label}
        })));
      }
      return out({ok:true,created:tokens,errors,created_count:tokens.length,error_count:errors.length});
    }

    if(input.action==="admin_create") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const cfg=await settings(s);
      let child:any=null,parentProfile:any=null;
      if(input.child_id) {
        const {data:c}=await s.from("children").select("id,parent_id,first_name,last_name,branch,group_name,active").eq("id",input.child_id).maybeSingle();
        if(!c||!c.active) return out({ok:false,code:"INVALID_CHILD"},400);
        child=c;
        const {data:p}=await s.from("profiles").select("id,full_name,phone,email").eq("id",c.parent_id).maybeSingle();
        parentProfile=p||null;
      }
      const studentName=String(input.student_name||(child?(child.first_name+" "+child.last_name):"")).trim();
      const parentName=String(input.parent_name||parentProfile?.full_name||"").trim();
      const parentPhone=String(input.parent_phone||parentProfile?.phone||"").trim();
      const parentEmail=String(input.parent_email||parentProfile?.email||"").trim().toLowerCase();
      const staticCheckout=cfg.checkout_mode==="static_product";
      const amount=Number(staticCheckout?cfg.monthly_amount_agorot:(input.amount_agorot??cfg.monthly_amount_agorot));
      const checkout=String(staticCheckout?cfg.provider_checkout_url:(input.provider_checkout_url||cfg.provider_checkout_url||DEFAULT_CHECKOUT_URL)).trim();
      if(!studentName||!parentName||normPhone(parentPhone).length<9||!Number.isInteger(amount)||amount<=0||!validHttps(checkout)||(parentEmail&&!validEmail(parentEmail))) return out({ok:false,code:"INVALID_INPUT"},400);
      const raw=makeToken(), hash=await digest(raw);
      const termHash=await termsHash(s,cfg.terms_version);
      const row={
        token_hash:hash,
        student_name:studentName,
        branch:String(input.branch||child?.branch||""),
        group_name:String(input.group_name||child?.group_name||""),
        parent_name:parentName,
        parent_phone:parentPhone,
        parent_email:parentEmail,
        parent_phone_normalized:normPhone(parentPhone),
        parent_email_normalized:parentEmail,
        child_id:child?.id||null,
        parent_profile_id:parentProfile?.id||null,
        amount_agorot:amount,
        billing_start_date:staticCheckout?cfg.billing_start_date:(input.billing_start_date||cfg.billing_start_date),
        billing_end_date:staticCheckout?cfg.billing_end_date:(input.billing_end_date||cfg.billing_end_date),
        number_of_cycles:staticCheckout?cfg.number_of_cycles:(input.number_of_cycles?Number(input.number_of_cycles):cfg.number_of_cycles),
        provider_checkout_url:checkout,
        parent_note:String(input.parent_note||""),
        internal_note:String(input.internal_note||""),
        terms_version:cfg.terms_version,
        terms_content_hash:termHash,
        season_label:cfg.season_label,
        cancellation_notice_days:cfg.cancellation_notice_days,
        price_change_notice_days:cfg.price_change_notice_days,
        expires_at:new Date(Date.now()+Number(cfg.link_expiry_days||14)*86400000).toISOString(),
        request_status:"draft",
        payment_status:"not_started",
        created_by:a.id
      };
      const {data,error}=await s.from("team_payment_requests").insert(row).select("id,student_name,parent_name,parent_phone,amount_agorot,request_status,payment_status,expires_at").single();
      if(error) throw error;
      await log(s,data.id,"admin","created",a.id,{child_id:row.child_id,terms_version:row.terms_version});
      return out({ok:true,request:data,token:raw});
    }

    if(input.action==="admin_mark_sent") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const now=new Date().toISOString();
      const {error}=await s.from("team_payment_requests").update({request_status:"sent",sent_at:now,updated_at:now}).eq("id",input.id);
      if(error) throw error;
      await log(s,input.id,"admin","marked_sent",a.id);
      return out({ok:true});
    }

    if(input.action==="admin_rotate") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const {data:current}=await s.from("team_payment_requests").select("request_status,payment_status,form_completed_at").eq("id",input.id).maybeSingle();
      if(!current || ["cancelled","completed"].includes(current.request_status) || ["active","finished"].includes(current.payment_status)) return out({ok:false,code:"NOT_EDITABLE"},409);
      const cfg=await settings(s);
      const raw=makeToken(), hash=await digest(raw), now=new Date().toISOString();
      const {data,error}=await s.from("team_payment_requests").update({
        token_hash:hash,expires_at:new Date(Date.now()+Number(cfg.link_expiry_days||14)*86400000).toISOString(),request_status:current.form_completed_at?"payment_pending":"sent",sent_at:now,updated_at:now
      }).eq("id",input.id).select("id").maybeSingle();
      if(error||!data) return out({ok:false,code:"NOT_EDITABLE"},409);
      await log(s,input.id,"admin","link_rotated",a.id);
      return out({ok:true,token:raw});
    }

    if(input.action==="admin_update") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      if("provider_checkout_url" in input && !validHttps(input.provider_checkout_url)) return out({ok:false,code:"INVALID_URL"},400);
      const {data:current}=await s.from("team_payment_requests").select("request_status,payment_status").eq("id",input.id).maybeSingle();
      if(!current || current.request_status==="cancelled") return out({ok:false,code:"NOT_EDITABLE"},409);
      const financialEdit=["amount_agorot","billing_start_date","billing_end_date","number_of_cycles","provider_checkout_url"].some(k=>k in input);
      const cfg=await settings(s);
      if(financialEdit && cfg.checkout_mode==="static_product") return out({ok:false,code:"FINANCIAL_SETTINGS_MANAGED"},409);
      if(financialEdit && ["active","finished"].includes(current.payment_status)) return out({ok:false,code:"PROVIDER_MANAGED"},409);
      const patch:any={updated_at:new Date().toISOString()};
      if("amount_agorot" in input){const v=Number(input.amount_agorot);if(!Number.isInteger(v)||v<=0)return out({ok:false,code:"INVALID_AMOUNT"},400);patch.amount_agorot=v;}
      if("billing_start_date" in input) patch.billing_start_date=input.billing_start_date||null;
      if("billing_end_date" in input) patch.billing_end_date=input.billing_end_date||null;
      if("number_of_cycles" in input) patch.number_of_cycles=input.number_of_cycles?Number(input.number_of_cycles):null;
      if("provider_checkout_url" in input) patch.provider_checkout_url=String(input.provider_checkout_url||"").trim()||null;
      if("parent_note" in input) patch.parent_note=String(input.parent_note||"");
      if("internal_note" in input) patch.internal_note=String(input.internal_note||"");
      const {data,error}=await s.from("team_payment_requests").update(patch).eq("id",input.id).neq("request_status","cancelled").select("*").maybeSingle();
      if(error||!data) return out({ok:false,code:"NOT_EDITABLE"},409);
      await log(s,input.id,"admin","updated",a.id,patch);
      return out({ok:true,request:data});
    }

    if(input.action==="admin_payment_status") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const allowed=["not_started","pending","active","failed","finished","cancelled"];
      if(!allowed.includes(input.payment_status)) return out({ok:false,code:"INVALID_STATUS"},400);
      if(input.payment_status==="cancelled" && input.provider_confirmed!==true) return out({ok:false,code:"PROVIDER_CONFIRM_REQUIRED"},400);
      const {data:current}=await s.from("team_payment_requests").select("request_status,payment_status,form_completed_at,completed_at,provider_recurring_id,cancellation_requested_at,provider_cancellation_required").eq("id",input.id).maybeSingle();
      if(!current) return out({ok:false,code:"NOT_FOUND"},404);
      const now=new Date().toISOString();
      const patch:any={payment_status:input.payment_status,updated_at:now};
      if(["active","finished"].includes(input.payment_status)) {
        patch.request_status="completed"; patch.completed_at=now; patch.cancelled_at=null;
      } else if(input.payment_status==="cancelled") {
        patch.request_status="cancelled"; patch.cancelled_at=now; patch.completed_at=null;
        patch.provider_cancellation_required=false; patch.provider_cancellation_confirmed_at=now;
      } else if(["pending","failed"].includes(input.payment_status)) {
        const alreadyActivated=!!current.provider_recurring_id||!!current.completed_at||current.request_status==="completed"||current.payment_status==="active";
        if(current.request_status==="cancelled"){
          patch.request_status="cancelled";
        }else{
          patch.request_status=alreadyActivated?"completed":(current.form_completed_at?"payment_pending":current.request_status);
          patch.completed_at=alreadyActivated?(current.completed_at||now):null;
        }
      } else if(input.payment_status==="not_started" && current.request_status==="completed") {
        const alreadyActivated=!!current.provider_recurring_id||!!current.completed_at;
        patch.request_status=alreadyActivated?"completed":(current.form_completed_at?"payment_pending":"sent");
        patch.completed_at=alreadyActivated?(current.completed_at||now):null;
      }
      const {error}=await s.from("team_payment_requests").update(patch).eq("id",input.id);
      if(error) throw error;
      await log(s,input.id,"admin","payment_status_changed",a.id,{payment_status:input.payment_status});
      return out({ok:true});
    }

    if(input.action==="admin_cancel") {
      const a=await admin(req); if(!a) return out({ok:false,code:"UNAUTHORIZED"},401);
      const {data:current}=await s.from("team_payment_requests").select("payment_status,provider_recurring_id").eq("id",input.id).maybeSingle();
      if(!current) return out({ok:false,code:"NOT_FOUND"},404);
      const now=new Date().toISOString();
      const providerActive=current.payment_status==="active"||!!current.provider_recurring_id;
      const patch:any={request_status:"cancelled",cancelled_at:now,cancellation_requested_at:now,updated_at:now};
      if(providerActive){
        patch.provider_cancellation_required=true;
        patch.provider_cancellation_confirmed_at=null;
      } else {
        patch.payment_status="cancelled";
        patch.provider_cancellation_required=false;
        patch.provider_cancellation_confirmed_at=now;
      }
      const {error}=await s.from("team_payment_requests").update(patch).eq("id",input.id);
      if(error) throw error;
      await log(s,input.id,"admin",providerActive?"cancellation_requested":"cancelled",a.id,{provider_cancellation_required:providerActive});
      return out({ok:true,provider_cancellation_required:providerActive});
    }

    if(input.action==="public_get") {
      const raw=String(input.token||"");
      if(!/^[a-f0-9]{64}$/i.test(raw)) return out({ok:false,code:"NOT_FOUND"},404);
      const hash=await digest(raw);
      const {data:r,error}=await s.from("team_payment_requests")
        .select("id,student_name,branch,group_name,amount_agorot,billing_start_date,billing_end_date,number_of_cycles,request_status,payment_status,parent_phone,parent_note,season_label,cancellation_notice_days,price_change_notice_days,terms_version,terms_content_hash,provider_checkout_url,expires_at,first_opened_at")
        .eq("token_hash",hash).maybeSingle();
      if(error||!r) return out({ok:false,code:"NOT_FOUND"},404);
      if(["cancelled","expired"].includes(r.request_status)||new Date(r.expires_at).getTime()<Date.now()) return out({ok:false,code:"LINK_INACTIVE"},410);
      let effectiveStatus=r.request_status;
      const now=new Date().toISOString();
      if(["draft","sent"].includes(r.request_status)) effectiveStatus="opened";
      if(!r.first_opened_at || effectiveStatus!==r.request_status) {
        const patch:any={updated_at:now};
        if(!r.first_opened_at) patch.first_opened_at=now;
        if(effectiveStatus!==r.request_status) patch.request_status=effectiveStatus;
        await s.from("team_payment_requests").update(patch).eq("id",r.id);
        if(!r.first_opened_at) await log(s,r.id,"parent","opened");
      }
      return out({
        ok:true,
        masked_phone:"***"+normPhone(r.parent_phone).slice(-4),
        verification_required:true
      });
    }

    if(input.action==="public_verify") {
      const raw=String(input.token||""), p=normPhone(input.parent_phone);
      if(!/^[a-f0-9]{64}$/i.test(raw)||p.length<9) return out({ok:false,code:"INVALID"},400);
      const ip=clientIp(req);
      if(!(await allowVerifyAttempt(s,raw,ip))) return out({ok:false,code:"RATE_LIMITED"},429);
      const hash=await digest(raw);
      const {data:r}=await s.from("team_payment_requests").select("id,student_name,branch,group_name,amount_agorot,billing_start_date,billing_end_date,number_of_cycles,parent_note,season_label,cancellation_notice_days,price_change_notice_days,terms_version,terms_content_hash,parent_name,parent_phone,parent_email,request_status,payment_status,provider_checkout_url,expires_at").eq("token_hash",hash).maybeSingle();
      if(!r||normPhone(r.parent_phone)!==p||["cancelled","expired"].includes(r.request_status)||new Date(r.expires_at).getTime()<Date.now()) return out({ok:false,code:"VERIFY_FAILED"},403);
      const proof=makeToken(),proofHash=await digest(proof),ipHash=ip?await digest("ip:"+ip):null;
      await s.from("team_payment_verification_sessions").delete().eq("request_id",r.id).is("used_at",null).lt("expires_at",new Date().toISOString());
      const {error:ve}=await s.from("team_payment_verification_sessions").insert({
        request_id:r.id,proof_hash:proofHash,ip_hash:ipHash,expires_at:new Date(Date.now()+30*60*1000).toISOString()
      });
      if(ve) throw ve;
      await log(s,r.id,"parent","phone_verified",null,{verification_expires_minutes:30});
      const request={
        student_name:r.student_name,branch:r.branch,group_name:r.group_name,amount_agorot:r.amount_agorot,
        billing_start_date:r.billing_start_date,billing_end_date:r.billing_end_date,number_of_cycles:r.number_of_cycles,
        parent_note:r.parent_note,season_label:r.season_label,cancellation_notice_days:r.cancellation_notice_days,
        price_change_notice_days:r.price_change_notice_days,terms_version:r.terms_version,terms_content_hash:r.terms_content_hash
      };
      const done=["payment_pending","completed"].includes(r.request_status);
      const mayPay=r.request_status==="payment_pending" && !["active","finished","cancelled"].includes(r.payment_status);
      return out({
        ok:true,parent_name:r.parent_name,parent_email:r.parent_email,verification_proof:proof,request,
        status_label:statusLabel(r.request_status),already_completed:done,
        completed_message:r.request_status==="completed"?"ההרשמה והתשלום מסומנים כהושלמו.":"הטופס כבר נשמר וממתין להשלמת התשלום.",
        checkout_url:mayPay?(r.provider_checkout_url||DEFAULT_CHECKOUT_URL):null
      });
    }

    if(input.action==="public_submit") {
      const raw=String(input.token||""), p=normPhone(input.parent_phone), c=input.consent||{}, verificationProof=String(input.verification_proof||"");
      if(!/^[a-f0-9]{64}$/i.test(raw)) return out({ok:false,code:"NOT_FOUND"},404);
      if(!/^[a-f0-9]{64}$/i.test(verificationProof)) return out({ok:false,code:"VERIFICATION_REQUIRED"},403);
      const hash=await digest(raw);
      const {data:r}=await s.from("team_payment_requests").select("*").eq("token_hash",hash).maybeSingle();
      if(!r||normPhone(r.parent_phone)!==p) return out({ok:false,code:"VERIFY_FAILED"},403);
      if(r.request_status==="cancelled"||r.request_status==="completed"||r.request_status==="expired"||new Date(r.expires_at).getTime()<Date.now()) return out({ok:false,code:"LINK_INACTIVE"},410);

      const required=[c.student_id_number,c.student_birth_date,c.parent_name,c.parent_id_number,c.parent_relationship,c.parent_phone,c.parent_email,c.signature_name];
      const badHealth=!!c.health_has_issue && ![c.health_notes,c.medications,c.allergies,c.respiratory_notes,c.orthopedic_notes,c.special_instructions].some((v:any)=>String(v||"").trim());
      if(required.some((v:any)=>!String(v||"").trim())||normPhone(c.parent_phone)!==p||!validIsraeliId(c.student_id_number)||!validIsraeliId(c.parent_id_number)||!validBirthDate(c.student_birth_date)||!validEmail(c.parent_email)||(c.emergency_phone&&normPhone(c.emergency_phone).length<9)||badHealth||!c.health_confirmed||!c.team_rules_accepted||!c.payment_terms_accepted||!c.admin_only_changes_accepted||!c.no_auto_cancel_accepted||!c.privacy_accepted||!c.guardian_confirmed) return out({ok:false,code:"INVALID_CONSENT"},400);

      const consent={
        student_id_number:String(c.student_id_number).replace(/\D/g,"").padStart(9,"0"),
        student_birth_date:c.student_birth_date,
        parent_name:String(c.parent_name).trim(),
        parent_id_number:String(c.parent_id_number).replace(/\D/g,"").padStart(9,"0"),
        parent_relationship:String(c.parent_relationship||""),
        parent_phone:String(c.parent_phone),
        parent_email:String(c.parent_email).trim().toLowerCase(),
        emergency_name:String(c.emergency_name||""),
        emergency_relationship:String(c.emergency_relationship||""),
        emergency_phone:String(c.emergency_phone||""),
        health_has_issue:!!c.health_has_issue,
        health_notes:String(c.health_notes||""),
        medications:String(c.medications||""),
        allergies:String(c.allergies||""),
        respiratory_notes:String(c.respiratory_notes||""),
        orthopedic_notes:String(c.orthopedic_notes||""),
        special_instructions:String(c.special_instructions||""),
        health_confirmed:true,
        photo_permission:!!c.photo_permission,
        team_rules_accepted:true,
        payment_terms_accepted:true,
        admin_only_changes_accepted:true,
        no_auto_cancel_accepted:true,
        privacy_accepted:true,
        privacy_version:"privacy-2026-09-v1",
        guardian_confirmed:true,
        signature_name:String(c.signature_name).trim(),
        extra_details:(c.extra_details&&typeof c.extra_details==="object")?c.extra_details:{}
      };
      const ipHash=clientIp(req)?await digest("ip:"+clientIp(req)):null;
      const {data:result,error}=await s.rpc("team_payment_submit_consent",{
        p_request_id:r.id,p_consent:consent,p_ip_hash:ipHash,p_user_agent:String(req.headers.get("user-agent")||"").slice(0,500)||null,
        p_verification_hash:await digest(verificationProof)
      });
      if(error){
        const msg=String(error.message||error);
        if(msg.includes("VERIFICATION_REQUIRED")) return out({ok:false,code:"VERIFICATION_REQUIRED"},403);
        if(msg.includes("REQUEST_INACTIVE")) return out({ok:false,code:"LINK_INACTIVE"},410);
        if(msg.includes("CONSENT_REQUIRED")) return out({ok:false,code:"INVALID_CONSENT"},400);
        throw error;
      }
      const checkoutStartedAt=new Date().toISOString();
      await s.from("team_payment_requests").update({checkout_started_at:checkoutStartedAt,updated_at:checkoutStartedAt}).eq("id",r.id);
      await log(s,r.id,"parent","checkout_started",null,{provider:"invoice4u"});
      return out({ok:true,checkout_url:result?.checkout_url||r.provider_checkout_url||DEFAULT_CHECKOUT_URL});
    }

    return out({ok:false,code:"NOT_FOUND"},404);
  } catch(e) {
    console.error("team-payment-api-v2",e);
    return out({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  }
});
