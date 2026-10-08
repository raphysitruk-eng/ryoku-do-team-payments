
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
function flatten(input:any,prefix="",out:Record<string,string>={},depth=0){
  if(depth>4) throw new Error("INVALID_PAYLOAD");
  if(!input||typeof input!=="object"||Array.isArray(input)) return out;
  for(const [k,v] of Object.entries(input)){
    if(Object.keys(out).length>=200) break;
    const key=(prefix?prefix+"."+k:k).slice(0,200);
    if(v!==null&&typeof v==="object"&&!Array.isArray(v)) flatten(v,key,out,depth+1);
    else {
      const s=scalar(v);
      if(s) out[key]=s.slice(0,1000);
    }
  }
  return out;
}
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
function sanitize(flat:Record<string,string>){
  const out:Record<string,string>={};
  const secretish=/(card|pan|cvv|cvc|track|password|passwd|secret|token|expir|expdate|credit.?card|card.?number|card.?num|security.?code|api.?key|authorization|jsonparamsbase64|owner.?id|unique.?id|^data$)/i;
  for(const [k,v] of Object.entries(flat)){
    out[k]=(secretish.test(k)||luhnCandidate(v))?"[REDACTED]":v;
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
function objectJson(raw:string){
  let value:any;try{value=JSON.parse(raw)}catch{throw new Error("INVALID_PAYLOAD")}
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_PAYLOAD");
  return value;
}
function decodeBase64(raw:string){
  // Invoice4U sends a bare Base64 body even with the form content type. Parsing
  // this as URLSearchParams first would corrupt '+' and padding characters.
  const value=raw.trim();
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4!==0)return null;
  try{
    const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    return objectJson(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  }catch{return null}
}
async function readBody(req:Request){
  if(Number(req.headers.get("content-length")||0)>65536)throw new Error("PAYLOAD_TOO_LARGE");
  if(!req.body)return "";
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>65536){await reader.cancel();throw new Error("PAYLOAD_TOO_LARGE")};chunks.push(value)}
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch{throw new Error("INVALID_PAYLOAD")}
}
function unwrapData(value:Record<string,any>){
  const entries=Object.entries(value),data=entries.find(([k])=>k.toLowerCase()==="data");
  if(!data)return value;
  const inner=typeof data[1]==="string"?objectJson(data[1]):data[1];
  if(!inner||typeof inner!=="object"||Array.isArray(inner))throw new Error("INVALID_PAYLOAD");
  // No outer overrides: status/amount/contact fields must come from one payload.
  if(entries.some(([k])=>k.toLowerCase()!=="data"&&k!=="key"))throw new Error("CONFLICTING_PAYLOAD");
  return inner;
}
async function parsePayload(req:Request){
  const url=new URL(req.url);
  const base:Record<string,any>={};
  for(const [k,v] of url.searchParams.entries()) if(k!=="key") base[k]=v;
  if(req.method==="GET") return unwrapData(base);
  const raw=(await readBody(req)).trim();
  if(!raw)return base;
  let payload:any;
  if(raw.startsWith("{"))payload=objectJson(raw);
  else{
    const decoded=decodeBase64(raw);
    if(decoded)payload=decoded;
    else{
      if(!raw.includes("=")||raw.startsWith("["))throw new Error("INVALID_PAYLOAD");
      const params=new URLSearchParams(raw),form:Record<string,string>={};
      for(const [k,v] of params.entries()){
        if(Object.hasOwn(form,k))throw new Error("CONFLICTING_PAYLOAD");
        form[k]=v;
      }
      payload=unwrapData(form);
    }
  }
  if(Object.keys(base).length)throw new Error("CONFLICTING_PAYLOAD");
  return unwrapData(payload);
}
function clientIp(req:Request){
  return (req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"").split(",")[0].trim().slice(0,100);
}
async function authMode(s:any,req:Request){
  const url=new URL(req.url),path=url.pathname.split("/").filter(Boolean);
  const at=path.indexOf("notify");
  const pathKey=at>=0?path[at+1]||"":"";
  const raw=pathKey||url.searchParams.get("key")||"";
  if(at>=0&&(!/^[a-f0-9]{96}$/.test(pathKey)||at+2!==path.length))return "invalid";
  if(!raw) return "capture";
  if(raw.length<32) return "invalid";
  const h=await sha(raw);
  const {data:r,error}=await s.from("team_payment_provider_secrets")
    .select("id,expires_at,purpose").eq("provider","invoice4u").eq("secret_hash",h).eq("active",true).maybeSingle();
  if(error)throw new Error("AUTH_LOOKUP_FAILED");
  if(!r||(r.expires_at&&new Date(r.expires_at).getTime()<Date.now())) return "invalid";
  if(pathKey&&r.purpose!=="invoice4u_ipn_path")return "invalid";
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
function amountAgorot(v:unknown){
  const raw=String(v??"").trim();
  if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(raw))return null;
  const value=Math.round(Number(raw.replace(",","."))*100);
  return Number.isSafeInteger(value)?value:null;
}
function orderDuration(v:unknown){
  const raw=String(v??"").trim();
  return /^\d{1,3}$/.test(raw)&&Number(raw)>0?Number(raw):null;
}
function booleanResult(v:unknown){
  const value=String(v??"").trim().toLowerCase();
  return value==="true"?true:value==="false"?false:null;
}
function normalizedEvent(flat:Record<string,string>){
  const seen=new Map<string,string>();
  for(const [k,v] of Object.entries(flat)){
    const name=k.toLowerCase().replace(/[^a-z0-9]/g,"");
    if(seen.has(name)&&seen.get(name)!==v)throw new Error("CONFLICTING_PAYLOAD");
    seen.set(name,v);
  }
  const phoneValue=phone(pick(flat,["phone","cell","mobile","customerphone","clientphone","phonenumber","customer.phone","client.phone"]));
  const email=pick(flat,["email","mail","customermail","customeremail","clientemail","customer.email","client.email"]).trim().toLowerCase();
  const amountRaw=pick(flat,["amount","total","sum","price","totalamount","paymentamount"]);
  const duration=orderDuration(pick(flat,["standingOrderDuration"]));
  const recurring=pick(flat,["standingorderid","standing_order_id","recurringid","recurring_id","subscriptionid","subscription_id"])||null;
  const clearing=pick(flat,["isSuccessClearing"]),setup=pick(flat,["Success"]);
  const confirmation=pick(flat,["clearingConfirmation"])||null;
  const monthly=!!clearing;
  const salesSetup=!monthly&&!setup&&duration!==null&&!!confirmation&&pick(flat,["paymentsNum"])==="0";
  const kind=monthly?"invoice4u_monthly_charge":setup?"invoice4u_api_setup":salesSetup?"invoice4u_sales_page_setup":"invoice4u_sales_page_ipn";
  const success=monthly?booleanResult(clearing):setup?booleanResult(setup):salesSetup?true:null;
  const documentSuccess=monthly?booleanResult(pick(flat,["isSuccessDocCreation"])):null;
  return {
    kind,event_type:monthly?(success===true?"monthly_charge_succeeded":success===false?"monthly_charge_failed":"monthly_charge_unknown"):
      success===true?"standing_order_created":success===false?"standing_order_setup_failed":"ipn_received",
    parent_phone:phoneValue||null,parent_email:email||null,
    provider_customer_id:pick(flat,["customerId"])||null,
    provider_recurring_id:recurring,
    provider_transaction_id:pick(flat,["paymentId","transactionid","transaction_id","dealid","deal_id","clearingid","clearing_id","saleid","sale_id"])||null,
    amount_raw:amountRaw||null,currency:(pick(flat,["currency"])||"ILS").toUpperCase(),
    standing_order_amount_agorot:monthly||setup||duration!==null?amountAgorot(amountRaw):null,
    standing_order_duration:duration,
    standing_order_first_charge_amount_agorot:amountAgorot(pick(flat,["standingOrderFirstChargeAmount"])),
    clearing_confirmation:confirmation,success,document_success:documentSuccess,
    clearing_error:pick(flat,["failureClearingMessage","ErrorMessage"]).slice(0,300)||null,
    document_error:pick(flat,["failureDocCreationMessage"]).slice(0,300)||null,
    // 'sum' reports the normal subscription amount. The callback does not
    // establish an overridden first debit amount; never label it actual debit.
    actual_amount_agorot:null
  };
}
async function matchUnique(s:any,p:string,e:string,orderAmount:number|null=null,duration:number|null=null){
  if(!p&&!e)return {request:null,strategy:"unmatched"};
  const candidates=()=>s.from("team_payment_requests")
    .select("id,parent_phone,parent_email,request_status,payment_status,amount_agorot,number_of_cycles,checkout_started_at")
    .in("request_status",["sent","opened","form_completed","payment_pending","completed"])
    .order("checkout_started_at",{ascending:false,nullsFirst:false});
  let q=candidates().limit(6);
  if(p&&e) q=q.eq("parent_phone_normalized",p).eq("parent_email_normalized",e);
  else if(p) q=q.eq("parent_phone_normalized",p);
  else q=q.eq("parent_email_normalized",e);
  const {data:matches,error}=await q;
  if(error)throw error;
  if((matches||[]).length===1)return {request:matches![0],strategy:p&&e?"phone_email_unique":p?"phone_unique":"email_unique"};
  if((matches||[]).length>1){
    if(matches!.length>=6)return {request:null,strategy:"ambiguous"};
    const cutoff=Date.now()-30*60*1000;
    const recent=(matches||[]).filter((r:any)=>r.request_status==="payment_pending"&&r.checkout_started_at&&new Date(r.checkout_started_at).getTime()>=cutoff&&new Date(r.checkout_started_at).getTime()<=Date.now()&&!["active","finished","cancelled"].includes(r.payment_status));
    if(recent.length===1)return {request:recent[0],strategy:"recent_checkout_unique"};
    return {request:null,strategy:"ambiguous"};
  }
  // A payer may enter a different email on the hosted sales page. Only link this
  // unsigned capture when the phone identifies one pending, recent checkout and
  // its standing-order amount and cycle count agree. This never activates billing.
  if(p&&e&&orderAmount!==null&&orderAmount>0&&duration!==null){
    const {data:byPhone,error:phoneError}=await candidates().eq("parent_phone_normalized",p).limit(2);
    if(phoneError)throw phoneError;
    if((byPhone||[]).length>1)return {request:null,strategy:"ambiguous"};
    if((byPhone||[]).length===1){
      const {data:byEmail,error:emailError}=await candidates().eq("parent_email_normalized",e).limit(1);
      if(emailError)throw emailError;
      if((byEmail||[]).length)return {request:null,strategy:"conflicting_email"};
      const candidate=byPhone![0],started=new Date(candidate.checkout_started_at||"").getTime(),now=Date.now();
      if(candidate.request_status==="payment_pending"&&!["active","finished","cancelled"].includes(candidate.payment_status)&&
         Number.isFinite(started)&&started>=now-30*60*1000&&started<=now&&
         candidate.amount_agorot===orderAmount&&candidate.number_of_cycles===duration){
        return {request:candidate,strategy:"phone_recent_checkout_email_mismatch"};
      }
    }
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
    const payload=await parsePayload(req);
    const flat=flatten(payload),safe=sanitize(flat);
    if(!Object.keys(safe).length) return reply({ok:false,code:"EMPTY_IPN"},400);
    const event=normalizedEvent(flat),p=event.parent_phone||"",e=event.parent_email||"";
    // Persist authenticated callbacks before any mapping. The transactional RPC
    // resolves the subscription and commits its ledger/status/audit together.
    const match=mode==="capture"?await matchUnique(s,p,e,event.standing_order_amount_agorot,event.standing_order_duration):{request:null,strategy:"pending_mapping"};
    const eventFingerprint=await sha(JSON.stringify(Object.fromEntries(Object.entries(flat).sort(([a],[b])=>a.localeCompare(b)))));
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const eventKey="invoice4u:ipn:"+await sha([mode==="secret"?"authenticated":"capture",event.kind,event.kind==="invoice4u_monthly_charge"?day:"",eventFingerprint].join(":"));
    const normalized={
      ...event,request_id:match.request?.id||null,
      parent_email_differs:match.strategy==="phone_recent_checkout_email_mismatch",
      match_strategy:match.strategy,
      capture_auth:mode,
      source_ip_hash:clientIp(req)?await sha("ip:"+clientIp(req)):null,
      note:mode==="secret"?"Authenticated callback; atomic mapping and processing required":"Unsigned capture: financial status is unchanged"
    };
    const {data:saved,error}=await s.from("team_payment_provider_events").insert({
      provider:"invoice4u",event_key:eventKey,event_type:mode==="capture"?"ipn_received":event.event_type,payment_status:null,
      request_id:match.request?.id||null,match_strategy:match.strategy,
      provider_recurring_id:event.provider_recurring_id,provider_transaction_id:event.provider_transaction_id,
      parent_phone:p||null,parent_email:e||null,source:"ipn",
      raw_payload:safe,normalized_payload:normalized,
      processing_status:mode==="secret"||match.request?"received":"unmatched",
      verification_status:mode==="secret"?"verified":"unverified",payload_schema_version:"invoice4u-ipn-sync-v4",
      error_message:mode==="secret"?null:"IPN_MAPPING_PENDING"
    }).select("id").maybeSingle();
    let eventId=saved?.id,duplicate=false;
    if(error?.code==="23505"){
      const {data:old,error:lookupError}=await s.from("team_payment_provider_events").select("id").eq("event_key",eventKey).maybeSingle();
      if(lookupError||!old)throw new Error("EVENT_LOOKUP_FAILED");eventId=old.id;duplicate=true;
    }else if(error)throw new Error("EVENT_SAVE_FAILED");
    if(mode==="capture")return reply({ok:true,received:true,...(duplicate?{duplicate:true}:{})});
    if(!eventId)throw new Error("EVENT_SAVE_FAILED");
    const {data:processed,error:processError}=await s.rpc("team_payment_apply_invoice4u_event",{p_event_id:eventId});
    if(processError){
      await s.from("team_payment_provider_events").update({error_message:"PROCESSING_RETRY_REQUIRED",next_retry_at:new Date(Date.now()+5*60000).toISOString()}).eq("id",eventId).eq("processing_status","received");
      // A durable capture is recoverable even though Invoice4U never retries.
      return reply({ok:true,received:true,queued:true});
    }
    return reply({ok:true,received:true,duplicate:duplicate||processed?.duplicate===true,processing_status:processed?.processing_status||"received"});
  }catch(e){
    const code=e instanceof Error?e.message:"SERVICE_UNAVAILABLE";
    if(["INVALID_PAYLOAD","CONFLICTING_PAYLOAD","PAYLOAD_TOO_LARGE"].includes(code))return reply({ok:false,code},code==="PAYLOAD_TOO_LARGE"?413:400);
    console.error("team-payment-invoice4u-ipn","SERVICE_UNAVAILABLE");
    return reply({ok:false,code:"SERVICE_UNAVAILABLE"},503);
  }
});

