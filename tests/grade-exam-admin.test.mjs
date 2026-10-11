import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/team-payment-api-v2/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,''));
function backend(){
  let handler;
  const state={profile:{id:'11111111-1111-4111-8111-111111111111',role:'admin',approval_status:'approved'},rows:[],rpcCalls:[],rpcResult:{ok:true},queries:[]};
  class Query{
    constructor(table){this.table=table;this.filters=[];state.queries.push(table);}
    select(columns){this.columns=columns.split(',');return this;}
    eq(key,value){this.filters.push(row=>row[key]===value);return this;}
    order(){return this;}
    range(from,to){this.start=from;this.end=to;return this;}
    or(filter){this.search=filter;return this;}
    async result(single=false){
      const original=this.table==='profiles'?[state.profile]:state.rows;
      let rows=original.filter(row=>this.filters.every(f=>f(row)));const count=rows.length;
      rows=rows.slice(this.start||0,(this.end??49)+1).map(row=>Object.fromEntries(this.columns.map(k=>[k,row[k]])));
      return {data:single?rows[0]||null:rows,count,error:null};
    }
    maybeSingle(){return this.result(true);}then(resolve,reject){return this.result().then(resolve,reject);}
  }
  const client={auth:{getUser:async()=>({data:{user:{id:state.profile.id}}})},from:table=>new Query(table),rpc:async(name,args)=>{state.rpcCalls.push({name,args});return {data:state.rpcResult,error:null};}};
  const context=vm.createContext({Request,Response,URL,TextEncoder,crypto:webcrypto,atob,console:{error(){}},createClient:()=>client,Deno:{env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'test-in-memory-only':undefined},serve:fn=>{handler=fn;}}});vm.runInContext(source,context);
  async function submit(input,aal='aal2'){
    const headers={'content-type':'application/json'};if(aal)headers.authorization='Bearer test.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.test';
    const response=await handler(new Request('https://example.invalid/api',{method:'POST',headers,body:JSON.stringify(input)}));return {status:response.status,body:await response.json()};
  }return {state,submit};
}
const fixture={id:'22222222-2222-4222-8222-222222222222',reference:'GE-ABCDEF123456',full_name:'בדיקה בלבד',contact_name:'הורה בדיקה',contact_phone:'0500000000',contact_email:'test@example.invalid',group_name:'beginners',branch:'herzog',current_rank:'white',exam_season:'2026-27',amount_agorot:10000,payment_method:'bit',payment_status:'reported_unverified',registration_status:'pending',created_at:'2026-10-11T01:00:00Z',updated_at:'2026-10-11T01:00:00Z',national_id:'123456782',birth_date:'2015-01-01',request_key_hash:'private',payload_hash:'private'};
test('exam listing and updates require an approved administrator with verified second factor',async()=>{
  for(const action of ['admin_grade_exam_list','admin_grade_exam_update']){
    const h=backend();for(const aal of [null,'aal1'])assert.equal((await h.submit({action},aal)).status,401);
    h.state.profile.role='parent';assert.equal((await h.submit({action})).status,401);
    h.state.profile.role='admin';h.state.profile.approval_status='pending';assert.equal((await h.submit({action})).status,401);
    assert.equal(h.state.queries.includes('grade_exam_registrations'),false);assert.equal(h.state.rpcCalls.length,0);
  }
});
test('exam listing filters the chosen branch, group and rank and excludes identity and capability fields',async()=>{
  const h=backend();h.state.rows=[fixture,{...fixture,id:'different',branch:'agamim'}];
  const r=await h.submit({action:'admin_grade_exam_list',branch:'herzog',group_name:'beginners',current_rank:'white',payment_status:'reported_unverified'});
  assert.equal(r.status,200);assert.equal(r.body.total,1);assert.equal(r.body.registrations[0].reference,fixture.reference);
  for(const key of ['national_id','birth_date','request_key_hash','payload_hash','student_identity_hash'])assert.equal(r.body.registrations[0][key],undefined);
  assert.equal((await h.submit({action:'admin_grade_exam_list',branch:'unknown'})).status,400);
  assert.equal((await h.submit({action:'admin_grade_exam_list',current_rank:'black'})).status,400);
});
test('exam edits pass only the authenticated actor and preserve the database evidence and stale-write checks',async()=>{
  const h=backend();const input={action:'admin_grade_exam_update',id:fixture.id,expected_updated_at:fixture.updated_at,payment_status:'verified',registration_status:'approved',payment_confirmed:true,note:'בדיקה מדומה בלבד',actor_id:'spoofed'};
  const r=await h.submit(input);assert.equal(r.status,200);assert.equal(h.state.rpcCalls[0].name,'admin_update_grade_exam');assert.equal(h.state.rpcCalls[0].args.p_actor,h.state.profile.id);
  for(const [code,status] of [['STALE_RECORD',409],['PAYMENT_EVIDENCE_REQUIRED',400],['PAYMENT_REQUIRED',400]]){h.state.rpcResult={ok:false,code};const r=await h.submit(input);assert.equal(r.status,status);assert.equal(r.body.code,code);}
  const count=h.state.rpcCalls.length;assert.equal((await h.submit({...input,id:'bad'})).status,400);assert.equal(h.state.rpcCalls.length,count);
  assert.equal(h.state.queries.some(x=>x.startsWith('team_payment')||x==='children'||x==='open_mat_registrations'),false,'Grade edits cannot mutate unrelated enrolments, balances or ranks');
});
