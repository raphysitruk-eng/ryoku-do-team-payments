
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const PROJECT_URL="https://zwgpvwxdofjidshsiaek.supabase.co";
const enc=new TextEncoder();

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "access-control-allow-origin":"*",
    "access-control-allow-headers":"authorization, content-type, x-ryokudo-webhook-key",
    "access-control-allow-methods":"POST, OPTIONS",
    "x-content-type-options":"nosniff"
  }});
}
function svc(){
  const packed=Deno.env.get("SUPABASE_SECRET_KEYS");
  const keys=packed?JSON.parse(packed):{};
  const key=keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key) throw new Error("server credential missing");
  return createClient(Deno.env.get("SUPABASE_URL")||PROJECT_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function sha(v:string){
  const b=await crypto.subtle.digest("SHA-256",enc.encode(v));
  return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
}
function token(){
  const b=new Uint8Array(48); crypto.getRandomValues(b);
  return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
}
function phone(v:unknown){
  let x=String(v||"").replace(/\D/g,"");
  if(x.startsWith("972")) x="0"+x.slice(3);
  return x;
}
function uuid(v:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""))}
function luhnCandidate(v:string){
  const digits=String(v||"").replace(/[\s-]/g,"");
  if(!/^\d{13,19}$/.test(digits)) return false;
  let sum=0,alt=false;
  for(let i=digits.length-1;i>=0;i--){
    let n=Number(digits[i]);
    if(alt){n*=2;if(n>9)n-=9;}
    sum+=n;alt=!alt;
  }
  return sum%10===0;
}
function safePayload(v:any,depth=0):any{
  if(depth>4) return "[TRUNCATED]";
  if(v===null||v===undefined||typeof v==="number"||typeof v==="boolean") return v;
  if(typeof v==="string") return luhnCandidate(v)?"[REDACTED]":v.slice(0,1000);
  if(Array.isArray(v)) return v.slice(0,30).map(x=>safePayload(x,depth+1));
  if(typeof v==="object"){
    const out:any={};
    for(const [k,val] of Object.entries(v)){
      if(/card|pan|cvv|cvc|track|password|passwd|secret|token|expir|expdate|credit.?card|card.?number|card.?num|security.?code/i.test(k)) out[k]="[REDACTED]";
      else out[k]=safePayload(val,depth+1);
    }
    return out;
  }
  return String(v).slice(0,1000);
}
function statusOf(i:any){
  const d=String(i.payment_status||"").toLowerCase();
  if(["not_started","pending","active","failed","finished","cancelled"].includes(d)) return d;
  const m:Record<string,string>={
    payment_succeeded:"active",purchase_succeeded:"active",recurring_created:"active",subscription_created:"active",
    payment_failed:"failed",charge_failed:"failed",recurring_cancelled:"cancelled",subscription_cancelled:"cancelled",
    recurring_finished:"finished",subscription_finished:"finished",payment_pending:"pending",purchase_pending:"pending"
  };
  return m[String(i.event_type||"").toLowerCase()]||"";
}
function jwtPayload(raw:string){
  try{
    const part=raw.split(".")[1]||"";
    const b64=part.replace(/-/g,"+").replace(/_/g,"/");
    const padded=b64+"=".repeat((4-b64.length%4)%4);
    return JSON.parse(atob(padded));
  }catch{return null}
}
async function admin(s:any,req:Request){
  const raw=(req.headers.get("authorization")||"").replace(/^Bearer\s+/,"");
  if(!raw) return null;
  const {data:{user}}=await s.auth.getUser(raw); if(!user) return null;
  const claims=jwtPayload(raw);
  if(claims?.aal!=="aal2") return null;
  const {data:p}=await s.from("profiles").select("role,approval_status").eq("id",user.id).maybeSingle();
  return p?.role==="admin"&&p?.approval_status==="approved"?user:null;
}
async function external(s:any,req:Request){
  const raw=String(req.headers.get("x-ryokudo-webhook-key")||"").trim();
  if(raw.length<32) return null;
  const h=await sha(raw);
  const {data:r}=await s.from("team_payment_provider_secrets").select("id,expires_at").eq("provider","invoice4u").eq("secret_hash",h).eq("active",true).maybeSingle();
  if(!r||(r.expires_at&&new Date(r.expires_at).getTime()<Date.now())) return null;
  await s.from("team_payment_provider_secrets").update({last_used_at:new Date().toISOString()}).eq("id",r.id);
  return r;
}
async function matchRequest(s:any,i:any){
  if(uuid(i.request_id)){
    const {data:r}=await s.from("team_payment_requests").select("*").eq("id",String(i.request_id)).maybeSingle();
    if(r)return {r,strategy:"request_id"};
  }
  const rid=String(i.provider_recurring_id||i.recurring_id||"").trim();
  if(rid){
    const {data:r}=await s.from("team_payment_requests").select("*").eq("provider_recurring_id",rid).maybeSingle();
    if(r)return {r,strategy:"provider_recurring_id"};
  }
  const tx=String(i.provider_transaction_id||i.transaction_id||"").trim();
  if(tx){
    const {data:r}=await s.from("team_payment_requests").select("*").eq("provider_last_transaction_id",tx).maybeSingle();
    if(r)return {r,strategy:"provider_transaction_id"};
  }
  const p=phone(i.parent_phone),e=String(i.parent_email||"").trim().toLowerCase();
  if(p||e){
    let q=s.from("team_payment_requests").select("*").in("request_status",["sent","opened","form_completed","payment_pending","completed"]).order("checkout_started_at",{ascending:false,nullsFirst:false}).limit(5);
    if(p&&e) q=q.eq("parent_phone_normalized",p).eq("parent_email_normalized",e);
    else if(p) q=q.eq("parent_phone_normalized",p);
    else q=q.eq("parent_email_normalized",e);
    const {data:rows}=await q;
    if((rows||[]).length===1)return {r:rows![0],strategy:p&&e?"phone_email_unique":p?"phone_unique":"email_unique"};
    if((rows||[]).length>1){
      const cutoff=Date.now()-30*60*1000;
      const recent=(rows||[]).filter((r:any)=>r.request_status==="payment_pending"&&r.checkout_started_at&&new Date(r.checkout_started_at).getTime()>=cutoff&&!["active","finished","cancelled"].includes(r.payment_status));
      if(recent.length===1)return {r:recent[0],strategy:"recent_checkout_unique"};
      return {r:null,strategy:"ambiguous"};
    }
  }
  return {r:null,strategy:"unmatched"};
}
async function audit(s:any,id:string|null,action:string,details:any){
  try{await s.from("team_payment_audit_log").insert({request_id:id,actor_type:"invoice4u",action,details})}catch{}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return json({ok:true});
  if(req.method!=="POST") return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  try{
    const i=await req.json(),s=svc();

    if(i.action==="admin_config"){
      const a=await admin(s,req); if(!a)return json({ok:false,code:"UNAUTHORIZED"},401);
      const {data:secret}=await s.from("team_payment_provider_secrets").select("id,created_at,last_used_at,expires_at").eq("provider","invoice4u").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle();
      const {data:events}=await s.from("team_payment_provider_events")
        .select("id,event_type,payment_status,request_id,match_strategy,provider_transaction_id,provider_recurring_id,amount_agorot,source,processing_status,error_message,received_at,processed_at")
        .order("received_at",{ascending:false}).limit(30);
      return json({ok:true,configured:!!secret,callback_url:PROJECT_URL+"/functions/v1/team-payment-provider-hook",ipn_url_base:PROJECT_URL+"/functions/v1/team-payment-invoice4u-ipn",invoice4u_ipn_mode:"capture_only_unsigned",auth_header:"x-ryokudo-webhook-key",secret_meta:secret||null,events:events||[]});
    }

    if(i.action==="admin_generate_secret"){
      const a=await admin(s,req); if(!a)return json({ok:false,code:"UNAUTHORIZED"},401);
      const raw=token(),h=await sha(raw),grace=new Date(Date.now()+24*3600000).toISOString();
      await s.from("team_payment_provider_secrets").update({expires_at:grace})
        .eq("provider","invoice4u").eq("active",true).is("expires_at",null);
      const {error}=await s.from("team_payment_provider_secrets").insert({provider:"invoice4u",secret_hash:h,label:"Invoice4U / Zapier webhook",active:true,created_by:a.id});
      if(error)throw error;
      return json({ok:true,secret:raw,callback_url:PROJECT_URL+"/functions/v1/team-payment-provider-hook",ipn_url:PROJECT_URL+"/functions/v1/team-payment-invoice4u-ipn?key="+encodeURIComponent(raw),auth_header:"x-ryokudo-webhook-key",warning:"כתובת ה-IPN והמפתח מוצגים פעם אחת בלבד. מפתח קודם, אם קיים, נשאר תקף עד 24 שעות לצורך מעבר בטוח."});
    }

    if(i.action!=="provider_event") return json({ok:false,code:"NOT_FOUND"},404);
    const a=await admin(s,req),x=a?null:await external(s,req);
    if(!a&&!x)return json({ok:false,code:"UNAUTHORIZED_WEBHOOK"},401);

    const eventType=String(i.event_type||"").trim(),paymentStatus=statusOf(i);
    if(!eventType||!paymentStatus)return json({ok:false,code:"INVALID_EVENT"},400);
    const source=a?(i.source==="test"?"test":"admin"):(i.source==="zapier"?"zapier":"webhook");
    const eventId=String(i.event_id||"").trim();
    const tx=String(i.provider_transaction_id||i.transaction_id||"").trim()||null;
    const recurring=String(i.provider_recurring_id||i.recurring_id||"").trim()||null;
    const customer=String(i.provider_customer_id||i.customer_id||"").trim()||null;
    const amount=Number.isFinite(Number(i.amount_agorot))?Math.round(Number(i.amount_agorot)):null;
    const occurred=i.occurred_at?new Date(i.occurred_at).toISOString():null;
    const basis=eventId||JSON.stringify({eventType,paymentStatus,request_id:i.request_id||null,tx,recurring,customer,amount,occurred,parent_phone:phone(i.parent_phone),parent_email:String(i.parent_email||"").trim().toLowerCase()});
    const eventKey=eventId?"invoice4u:"+eventId:"invoice4u:sha256:"+await sha(basis);

    const {data:old}=await s.from("team_payment_provider_events").select("id,request_id,processing_status,retry_count").eq("event_key",eventKey).maybeSingle();
    if(old&&["processed","ignored"].includes(old.processing_status))return json({ok:true,duplicate:true,event_id:old.id,request_id:old.request_id,processing_status:old.processing_status});

    const m=await matchRequest(s,i),r=m.r;
    const normalized={event_type:eventType,payment_status:paymentStatus,request_id:r?.id||null,match_strategy:m.strategy,provider_customer_id:customer,provider_recurring_id:recurring,provider_transaction_id:tx,amount_agorot:amount,currency:String(i.currency||"ILS").toUpperCase(),occurred_at:occurred};
    let ev:any=old?{id:old.id}:null;
    if(old){
      const {error:retryErr}=await s.from("team_payment_provider_events").update({
        request_id:r?.id||old.request_id||null,match_strategy:m.strategy,normalized_payload:normalized,
        raw_payload:safePayload((i.raw_payload&&typeof i.raw_payload==="object")?i.raw_payload:i),
        processing_status:r?"received":"unmatched",error_message:null,last_attempt_at:new Date().toISOString(),
        retry_count:Number(old.retry_count||0)+1
      }).eq("id",old.id);
      if(retryErr)throw retryErr;
    }else{
      const {data:created,error:ee}=await s.from("team_payment_provider_events").insert({
        provider:"invoice4u",event_key:eventKey,event_type:eventType,payment_status:paymentStatus,request_id:r?.id||null,match_strategy:m.strategy,
        provider_customer_id:customer,provider_recurring_id:recurring,provider_transaction_id:tx,amount_agorot:amount,currency:normalized.currency,
        parent_phone:String(i.parent_phone||"").trim()||null,parent_email:String(i.parent_email||"").trim()||null,source,
        raw_payload:safePayload((i.raw_payload&&typeof i.raw_payload==="object")?i.raw_payload:i),normalized_payload:normalized,
        processing_status:r?"received":"unmatched",occurred_at:occurred,last_attempt_at:new Date().toISOString()
      }).select("id").single();
      if(ee)throw ee;
      ev=created;
    }
    if(!r)return json({ok:true,matched:false,event_id:ev.id,processing_status:"unmatched"},202);

    const currency=String(i.currency||"ILS").toUpperCase();
    if(amount!==null && ["active","pending","failed"].includes(paymentStatus) && Number(r.amount_agorot)!==amount){
      const now=new Date().toISOString();
      await s.from("team_payment_provider_events").update({processing_status:"failed",error_message:"AMOUNT_MISMATCH",processed_at:now}).eq("id",ev.id);
      await audit(s,r.id,"provider_event_amount_mismatch",{event_id:ev.id,expected:r.amount_agorot,received:amount});
      return json({ok:true,matched:true,processed:false,event_id:ev.id,request_id:r.id,reason:"AMOUNT_MISMATCH"},202);
    }
    if(currency && String(r.currency||"ILS").toUpperCase()!==currency){
      const now=new Date().toISOString();
      await s.from("team_payment_provider_events").update({processing_status:"failed",error_message:"CURRENCY_MISMATCH",processed_at:now}).eq("id",ev.id);
      return json({ok:true,matched:true,processed:false,event_id:ev.id,request_id:r.id,reason:"CURRENCY_MISMATCH"},202);
    }

    const now=new Date().toISOString(),patch:any={payment_status:paymentStatus,provider_last_event_id:eventKey,provider_last_synced_at:now,provider_sync_source:source,updated_at:now};
    if(customer)patch.provider_customer_id=customer;
    if(recurring)patch.provider_recurring_id=recurring;
    if(tx)patch.provider_last_transaction_id=tx;
    if(paymentStatus==="active"){
      if(r.request_status==="cancelled"&&r.provider_cancellation_required){
        patch.request_status="cancelled";patch.cancelled_at=r.cancelled_at||now;patch.provider_cancellation_required=true;
      }else{
        patch.request_status="completed";patch.completed_at=r.completed_at||now;patch.cancelled_at=null;patch.provider_cancellation_required=false;
      }
    }
    else if(paymentStatus==="finished"){
      patch.request_status=r.request_status==="cancelled"?"cancelled":"completed";
      patch.completed_at=r.completed_at||now;
      if(r.request_status==="cancelled"){patch.provider_cancellation_required=false;patch.provider_cancellation_confirmed_at=now;}
    }
    else if(paymentStatus==="cancelled"){
      patch.request_status="cancelled";patch.cancelled_at=r.cancelled_at||now;
      patch.provider_cancellation_required=false;patch.provider_cancellation_confirmed_at=now;
    }
    else if(["pending","failed"].includes(paymentStatus)){
      if(r.request_status==="cancelled"){
        patch.request_status="cancelled";patch.cancelled_at=r.cancelled_at||now;
      }else{
        const alreadyActivated=!!r.provider_recurring_id||!!r.completed_at||r.request_status==="completed";
        patch.request_status=alreadyActivated?"completed":(r.form_completed_at?"payment_pending":r.request_status);
        if(alreadyActivated) patch.completed_at=r.completed_at||r.provider_last_synced_at||now;
        else patch.completed_at=null;
      }
    }

    const {error:ue}=await s.from("team_payment_requests").update(patch).eq("id",r.id);
    if(ue){await s.from("team_payment_provider_events").update({processing_status:"failed",error_message:String(ue.message||ue),processed_at:now}).eq("id",ev.id);throw ue}
    await s.from("team_payment_provider_events").update({processing_status:"processed",processed_at:now}).eq("id",ev.id);
    await audit(s,r.id,"provider_event_processed",{event_id:ev.id,event_key:eventKey,event_type:eventType,payment_status:paymentStatus,source,match_strategy:m.strategy});
    return json({ok:true,matched:true,event_id:ev.id,request_id:r.id,payment_status:paymentStatus,match_strategy:m.strategy});
  }catch(e){
    console.error("team-payment-provider-hook",e);
    return json({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  }
});
