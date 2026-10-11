// Run with Node 24+. This executes the real Edge handler with mocked services.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const path=new URL('../supabase/functions/team-payment-api-v2/index.ts',import.meta.url);
const source=stripTypeScriptTypes((await readFile(path,'utf8')).replace(/^import .*;\s*$/gm,''));
function fixture({aal='aal2',role='admin',authError=null,profileError=null,rpcResult={ok:true}}={}){
  let handler;const calls=[];
  const service={auth:{getUser:async()=>({data:{user:authError?null:{id:'verified-admin'}},error:authError})},from(){const query=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve({data:{id:'verified-admin',role,approval_status:'approved'},error:profileError}).then(resolve,reject);return ()=>query;}});return query;},rpc:async(name,params)=>{calls.push({name,params});return {data:rpcResult,error:null};}};
  const context=vm.createContext({createClient:()=>service,Deno:{env:{get:name=>name==='SUPABASE_SECRET_KEYS'?'':'fixture-only'},serve:fn=>handler=fn},Request,Response,Headers,URL,Date,crypto,TextEncoder,TextDecoder,atob,btoa,console:{error(){},log(){}}});
  vm.runInContext(source,context);
  const token='header.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.signature';
  return {calls,async request(body,{anonymous=false}={}){const response=await handler(new Request('https://example.invalid/api',{method:'POST',headers:{'content-type':'application/json',...(anonymous?{}:{authorization:'Bearer '+token})},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}};
}
const payload={action:'admin_open_mat_update',reference:'OM-123456789ABC',expected_updated_at:'2026-10-11T12:00:00Z',payment_status:'verified',booking_status:'approved',payment_confirmed:true,note:'QA mock only',actor_id:'spoofed-actor'};
for(const options of [{aal:'aal1'},{role:'parent'},{authError:{status:401,message:'invalid token'}}]){const f=fixture(options),r=await f.request(payload);assert.equal(r.status,401);assert.equal(f.calls.length,0);}
const anonymous=fixture();assert.equal((await anonymous.request(payload,{anonymous:true})).status,401);assert.equal(anonymous.calls.length,0);
for(const options of [{authError:{status:503,message:'auth offline'}},{profileError:{message:'database offline'}}]){const f=fixture(options),r=await f.request(payload);assert.equal(r.status,503);assert.equal(r.data.code,'SERVICE_UNAVAILABLE');assert.equal(f.calls.length,0);}
const good=fixture();assert.equal((await good.request(payload)).status,200);assert.equal(good.calls[0].name,'admin_update_open_mat');assert.equal(good.calls[0].params.p_actor,'verified-admin');assert.equal(good.calls[0].params.p_payment_confirmed,true);
const stale=fixture({rpcResult:{ok:false,code:'STALE_RECORD'}});assert.equal((await stale.request(payload)).status,409);
const invalid=fixture();assert.equal((await invalid.request({...payload,reference:'not-a-reference'})).status,400);assert.equal(invalid.calls.length,0);
console.log('Passed: anonymous/AAL1/parent rejection, transient authentication and database failures, verified actor, RPC contract, stale-record response and invalid booking reference.');
