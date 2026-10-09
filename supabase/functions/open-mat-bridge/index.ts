import { PRICE_AGOROT,privacyNotice,sha256,terms,validRequestKey,validateRegistration } from './validation.ts';
import auth from './auth.json' with {type:'json'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function handle(req:Request){
  if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!/^[a-f0-9]{64}$/.test(token)||await sha256(token)!==auth.sha256)return reply({error:'UNAUTHORIZED'},401);
  try{
    const text=await req.text();if(new TextEncoder().encode(text).length>16000)return reply({error:'REQUEST_TOO_LARGE'},413);
    const input=JSON.parse(text);
    if(!input||Array.isArray(input)||typeof input!=='object')return reply({error:'INVALID_REQUEST'},400);
    const root=Deno.env.get('SUPABASE_URL');
    const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!root||!secret)return reply({error:'SERVICE_UNAVAILABLE'},503);
    async function rpc(name:string,payload:unknown){
      const headers:Record<string,string>={apikey:secret,'content-type':'application/json'};
      if(secret.startsWith('eyJ'))headers.authorization='Bearer '+secret;
      const response=await fetch(root+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
      const data=await response.json();
      if(!response.ok){const code=String(data?.message||'');
        if(/KEY_CONFLICT|DUPLICATE_SESSION/.test(code))throw {status:409,message:'כבר התקבלה בקשה לפרטים אלו. אין לבצע תשלום נוסף; פנו לרפי לבירור.'};
        if(/NOT_FOUND/.test(code))throw {status:404,message:'הבקשה לא נמצאה. פנו לרפי עם קוד הבקשה.'};
        if(/ADULTS_ONLY|INVALID_DATE|INVALID_CONSENT|INVALID_REFERENCE/.test(code))throw {status:400,message:'יש לבדוק את הפרטים, הגיל והתנאים ולשלוח מחדש.'};
        throw {status:503,message:'לא התקבל אישור שמירה. נסו שוב באותם פרטים; לא תיווצר הרשמה כפולה.'};
      }
      return data;
    }
    if(input.action==='register'){
      if(!validRequestKey(input.requestKey)||!(/^[a-f0-9]{64}$/.test(input.sourceHash)))return reply({error:'INVALID_REQUEST'},400);
      const {data,errors}=validateRegistration(input.data);if(!data)return reply({error:'יש להשלים את הפרטים והאישורים המסומנים.',errors},400);
      const payload={...data,reference:'OM-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),requestKeyHash:await sha256(input.requestKey),participantSessionHash:await sha256([data.nationalId,data.trainingDate,data.trainingTime].join('|')),payloadHash:await sha256(JSON.stringify(data)),amountAgorot:PRICE_AGOROT,termsHash:await sha256(JSON.stringify({terms,privacyNotice})),consentSnapshot:{adult:true,hall:true,equipment:true,insurance:true,termsAndPrivacy:true}};
      const result=await rpc('register_open_mat',{p_payload:payload,p_source_hash:input.sourceHash});
      if(result?.error==='RATE_LIMITED')return reply({error:'בוצעו הרשמות רבות מדי. נסו שוב מאוחר יותר או פנו לרפי.'},429);
      return reply(result,result.replayed?200:201);
    }
    if(input.action==='report'){
      if(!validRequestKey(input.requestKey)||typeof input.reference!=='string'||!/^OM-[A-F0-9]{12}$/.test(input.reference)||typeof input.paymentReference!=='string'||input.paymentReference.length>100||/[\u0000-\u001f<>]/.test(input.paymentReference))return reply({error:'INVALID_REQUEST'},400);
      return reply(await rpc('report_open_mat_payment',{p_reference:input.reference,p_key_hash:await sha256(input.requestKey),p_payment_reference:input.paymentReference}));
    }
    return reply({error:'INVALID_ACTION'},400);
  }catch(error){const e=error as {status?:number;message?:string};return reply({error:e.status?e.message:'שירות ההרשמה אינו זמין כרגע.'},e.status||503);}
}
Deno.serve(handle);
