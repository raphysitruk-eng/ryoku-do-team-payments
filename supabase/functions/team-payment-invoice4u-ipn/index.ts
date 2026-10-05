
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const PROJECT_URL="https://zwgpvwxdofjidshsiaek.supabase.co";
const enc=new TextEncoder();

function reply(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
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
function phone(v:unknown){
  let x=String(v||"").replace(/\D/g,"");
  if(x.startsWith("972")) x="0"+x.slice(3);
  return x;
}
function scalar(v:any){
  if(v===null||v===undefined) return "";
  if(typeof v==="string"||typeof v==="number"||typeof v==="boolean") return String(v);
  return "";
}
function flatten(input:any,prefix="",out:Record<string,string>={}){
  if(!input||typeof input!=="object"||Array.isArray(input)) return out;
  for(const [k,v] of Object.entries(input)){
    if(Object.keys(out).length>=200) break;
    const key=(prefix?prefix+"."+k:k).slice(0,200);
    if(v!==null&&typeof v==="object"&&!Array.isArray(v)) flatten(v,key,out);
    else {
      const s=scalar(v);
      if(s) out[key]=s.slice(0,1000);
    }
  }
  return out;
}
function sanitize(flat:Record<string,string>){
  const out:Record<string,string>={};
  const secretish=/(^|\.)(card|pan|cvv|cvc|track2|password|secret|token|expiry|expdate|cardnumber|creditcard)(\.|$)/i;
  for(const [k,v] of Object.entries(flat)){
    out[k]=secretish.test(k)?"[REDACTED]":v;
  }
  return out;
}
function pick(flat:Record<string,string>,names:string[]){
  const lowered=Object.fromEntries(Object.entries(flat).map(([k,v])=>[k.toLowerCase().replace(/[^a-z0-9]/g,""),v]));
  for(const n of names){
    const v=lowered[n.toLowerCase().replace(/[^a-z0-9]/g,"")];
    if(v) return v;
  }
  return "";
}
async function parsePayload(req:Request){
  const url=new URL(req.url);
  const base:Record<string,any>={};
  for(const [k,v] of url.searchParams.entries()) if(k!=="key") base[k]=v;
  if(req.method==="GET") return base;
  const ct=(req.headers.get("content-type")||"").toLowerCase();
  try{
    if(ct.includes("application/json")) return {...base,...await req.json()};
    if(ct.includes("application/x-www-form-urlencoded")||ct.includes("multipart/form-data")){
      const fd=await req.formData(),x:Record<string,string>={};
      for(const [k,v] of fd.entries()) if(typeof v==="string") x[k]=v;
      return {...base,...x};
    }
    const raw=await req.text();
    if(!raw) return base;
    try{return {...base,...JSON.parse(raw)}}catch{
      const p=new URLSearchParams(raw),x:Record<string,string>={};
      for(const [k,v] of p.entries())x[k]=v;
      return {...base,...x};
    }
  }catch{return base}
}
function clientIp(req:Request){
  return (req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"").split(",")[0].trim().slice(0,100);
}
async function authMode(s:any,req:Request){
  const raw=new URL(req.url).searchParams.get("key")||"";
  if(!raw) return "capture";
  if(raw.length<32) return "invalid";
  const h=await sha(raw);
  const {data:r}=await s.from("team_payment_provider_secrets")
    .select("id,expires_at").eq("provider","invoice4u").eq("secret_hash",h).eq("active",true).maybeSingle();
  if(!r||(r.expires_at&&new Date(r.expires_at).getTime()<Date.now())) return "invalid";
  await s.from("team_payment_provider_secrets").update({last_used_at:new Date().toISOString()}).eq("id",r.id);
  return "secret";
}
async function allowCaptureAttempt(s:any,req:Request){
  const ip=clientIp(req)||"unknown";
  const key=await sha("ipn-capture:"+ip);
  const windowMs=15*60*1000;
  const windowStart=new Date(Math.floor(Date.now()/windowMs)*windowMs).toISOString();
  const {data:r}=await s.from("team_payment_rate_limits").select("attempts").eq("key_hash",key).eq("window_start",windowStart).maybeSingle();
  const attempts=Number(r?.attempts||0);
  if(attempts>=30) return false;
  if(r) await s.from("team_payment_rate_limits").update({attempts:attempts+1}).eq("key_hash",key).eq("window_start",windowStart);
  else await s.from("team_payment_rate_limits").insert({key_hash:key,window_start:windowStart,attempts:1});
  return true;
}
async function matchUnique(s:any,p:string,e:string){
  if(!p&&!e)return {request:null,strategy:"unmatched"};
  let q=s.from("team_payment_requests")
    .select("id,parent_phone,parent_email,request_status,payment_status,amount_agorot,checkout_started_at")
    .in("request_status",["sent","opened","form_completed","payment_pending","completed"])
    .order("checkout_started_at",{ascending:false,nullsFirst:false}).limit(5);
  if(p&&e) q=q.eq("parent_phone_normalized",p).eq("parent_email_normalized",e);
  else if(p) q=q.eq("parent_phone_normalized",p);
  else q=q.eq("parent_email_normalized",e);
  const {data:matches}=await q;
  if((matches||[]).length===1)return {request:matches![0],strategy:p&&e?"phone_email_unique":p?"phone_unique":"email_unique"};
  if((matches||[]).length>1){
    const cutoff=Date.now()-30*60*1000;
    const recent=(matches||[]).filter((r:any)=>r.request_status==="payment_pending"&&r.checkout_started_at&&new Date(r.checkout_started_at).getTime()>=cutoff&&!["active","finished","cancelled"].includes(r.payment_status));
    if(recent.length===1)return {request:recent[0],strategy:"recent_checkout_unique"};
    return {request:null,strategy:"ambiguous"};
  }
  return {request:null,strategy:"unmatched"};
}

Deno.serve(async(req)=>{
  if(!["GET","POST"].includes(req.method))return reply({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  try{
    const s=svc();
    const mode=await authMode(s,req);
    if(mode==="invalid") return reply({ok:false,code:"UNAUTHORIZED_IPN"},401);
    if(mode==="capture"&&!(await allowCaptureAttempt(s,req))) return reply({ok:false,code:"RATE_LIMITED"},429);
    const contentLength=Number(req.headers.get("content-length")||0);
    if(contentLength>65536) return reply({ok:false,code:"PAYLOAD_TOO_LARGE"},413);

    const payload=await parsePayload(req);
    const flat=flatten(payload),safe=sanitize(flat);
    if(!Object.keys(safe).length) return reply({ok:false,code:"EMPTY_IPN"},400);
    const p=phone(pick(flat,["phone","cell","mobile","customerphone","clientphone","phonenumber","customer.phone","client.phone"]));
    const e=pick(flat,["email","mail","customeremail","clientemail","customer.email","client.email"]).trim().toLowerCase();
    const tx=pick(flat,["transactionid","transaction_id","dealid","deal_id","clearingid","clearing_id","saleid","sale_id","confirmationnumber","confirmation_number"])||null;
    const recurring=pick(flat,["standingorderid","standing_order_id","recurringid","recurring_id","subscriptionid","subscription_id"])||null;
    const amountRaw=pick(flat,["amount","total","sum","price","totalamount","paymentamount"])||null;
    const match=await matchUnique(s,p,e);

    const eventBasis=JSON.stringify(safe);
    const eventKey="invoice4u:ipn:"+await sha(tx?("tx:"+tx):eventBasis);
    const {data:old}=await s.from("team_payment_provider_events").select("id,processing_status,request_id").eq("event_key",eventKey).maybeSingle();
    if(old)return reply({ok:true,received:true,duplicate:true});

    const normalized={
      kind:"invoice4u_sales_page_ipn",
      parent_phone:p||null,parent_email:e||null,
      provider_transaction_id:tx,provider_recurring_id:recurring,
      amount_raw:amountRaw,request_id:match.request?.id||null,
      match_strategy:match.strategy,
      capture_auth:mode,
      source_ip_hash:clientIp(req)?await sha("ip:"+clientIp(req)):null,
      note:"Capture-only until Invoice4U IPN field mapping/verification is confirmed"
    };
    const {error}=await s.from("team_payment_provider_events").insert({
      provider:"invoice4u",event_key:eventKey,event_type:"ipn_received",payment_status:null,
      request_id:match.request?.id||null,match_strategy:match.strategy,
      provider_recurring_id:recurring,provider_transaction_id:tx,
      parent_phone:p||null,parent_email:e||null,source:"ipn",
      raw_payload:safe,normalized_payload:normalized,
      processing_status:match.request?"received":"unmatched",
      verification_status:mode==="secret"?"verified":"unverified",payload_schema_version:"invoice4u-ipn-capture-v2",
      error_message:"IPN_MAPPING_PENDING"
    });
    if(error)throw error;
    return reply({ok:true,received:true});
  }catch(e){
    console.error("team-payment-invoice4u-ipn",e);
    return reply({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  }
});
