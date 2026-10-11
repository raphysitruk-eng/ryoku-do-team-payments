import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const parentSource = fs.readFileSync(new URL('parent.js', root), 'utf8');
const edgeSource = stripTypeScriptTypes(fs.readFileSync(new URL('supabase/functions/team-payment-api-v2/index.ts', root), 'utf8').replace(/^import .*;\s*$/gm, ''));

function parentForm() {
  const nodes = new Map(), calls = [], locations = [];
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: true, textContent: '', innerHTML: '', attrs: {}, classList: { add() {}, remove() {} }, setAttribute(k,v) { this.attrs[k]=v; }, setCustomValidity(v) { this.validation=v; }, querySelector() { return element('submit'); } });
    return nodes.get(id);
  };
  const context = vm.createContext({window:{},document:{getElementById:element,querySelector:s=>({value:s.includes('health')?'no':'yes'})},location:{search:'',pathname:'/parent.html',assign:url=>locations.push(url)},sessionStorage:{getItem:()=>null},history:{replaceState(){}},URL,URLSearchParams,Date,console,scrollTo(){},fetch:async(_,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,checkout_url:'https://private.invoice4u.co.il/test'})};}});
  vm.runInContext(parentSource, context);
  vm.runInContext('window._token="a".repeat(64);VP="0500000001";VPROOF="b".repeat(64);PACCOUNT=true;',context);
  for(const [id,value] of Object.entries({studentDob:'2015-01-01',parentName:'Fixture Guardian',parentPhone:'0500000001',parentEmail:'fixture@example.test',relationship:'אב',signatureName:'Fixture Guardian'}))element(id).value=value;
  return {context,element,calls,locations,submit:()=>element('form').onsubmit({preventDefault(){}})};
}

test('both document selectors switch the number label, keyboard, limits and validity',()=>{
  const f=parentForm();
  for(const prefix of ['student','parent']) {
    const select=f.element(prefix+'IdType'),input=f.element(prefix+'Id');
    input.value='001ab2345';select.value='passport';select.onchange();
    assert.match(f.element(prefix+'IdLabel').textContent,/דרכון/);
    assert.equal(input.attrs.inputmode,'text');assert.equal(input.attrs.maxlength,'20');assert.equal(input.validation,'');
    select.value='israeli_id';select.onchange();
    assert.equal(input.attrs.inputmode,'numeric');assert.equal(input.attrs.maxlength,'9');assert.ok(input.validation);
    select.value='passport';select.onchange();assert.equal(input.validation,'');
  }
});
test('passport registration submits both types and preserves letters and leading zeroes',async()=>{
  const f=parentForm();
  for(const prefix of ['student','parent'])f.element(prefix+'IdType').value='passport';
  f.element('studentId').value='001ab2345';f.element('parentId').value='xy123456789012';
  await f.submit();
  const c=f.calls[0].consent;
  assert.equal(c.student_id_type,'passport');assert.equal(c.student_id_number,'001AB2345');
  assert.equal(c.parent_id_type,'passport');assert.equal(c.parent_id_number,'XY123456789012');
  assert.equal(f.locations.length,1);
});
test('a passport student can register with an Israeli-ID guardian',async()=>{
  const f=parentForm();f.element('studentIdType').value='passport';f.element('studentId').value='AB123456';f.element('parentId').value='123456782';
  await f.submit();assert.equal(f.calls[0].consent.parent_id_type,'israeli_id');assert.equal(f.calls[0].consent.parent_id_number,'123456782');
});
test('invalid passport numbers stop before submission',async()=>{
  for(const value of ['AB12','AB-12345','AB 12345','א123456','A'.repeat(21)]) {
    const f=parentForm();f.element('studentIdType').value='passport';f.element('studentId').value=value;f.element('parentId').value='123456782';
    await f.submit();assert.equal(f.calls.length,0,value);assert.match(f.element('msg').innerHTML,/דרכון/);
  }
});

function backend() {
  let handler, consent;
  const request={id:'fixture-request',parent_phone:'0500000001',request_status:'sent',expires_at:new Date(Date.now()+86400000).toISOString(),provider_checkout_url:'https://private.invoice4u.co.il/test'};
  class Query {
    select(){return this;}eq(){return this;}is(){return this;}update(){return this;}insert(){return this;}
    maybeSingle(){return Promise.resolve({data:request,error:null});}
    then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}
  }
  const context=vm.createContext({Request,Response,URL,TextEncoder,crypto:webcrypto,console:{error(){}},createClient:()=>({from:()=>new Query(),rpc:async(_name,input)=>{consent=input.p_consent;return {data:{checkout_url:request.provider_checkout_url},error:null};}}),Deno:{env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-server-secret':undefined},serve:fn=>handler=fn}});
  vm.runInContext(edgeSource,context);
  vm.runInContext('ensurePortalAccount=async()=>({account_created:false,profile_id:"fixture-parent",child_id:"fixture-child",username:"+972500000001"});',context);
  async function submit(c,proof='b'.repeat(64)) {
    const response=await handler(new Request('https://fixture.test/team-payment-api-v2',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'public_submit',token:'a'.repeat(64),parent_phone:request.parent_phone,verification_proof:proof,consent:c})}));
    return {status:response.status,body:await response.json(),consent};
  }
  return {submit};
}
const consent={student_id_number:'123456782',student_birth_date:'2015-01-01',parent_name:'Fixture Guardian',parent_id_number:'123456782',parent_relationship:'אב',parent_phone:'0500000001',parent_email:'fixture@example.test',signature_name:'Fixture Guardian',health_confirmed:true,team_rules_accepted:true,payment_terms_accepted:true,admin_only_changes_accepted:true,no_auto_cancel_accepted:true,privacy_accepted:true,guardian_confirmed:true};
test('server validates mixed documents and sends their exact normalized values to the consent transaction',async()=>{
  const r=await backend().submit({...consent,student_id_type:'passport',student_id_number:'001ab23456789',parent_id_type:'passport',parent_id_number:'xy12345'});
  assert.equal(r.status,200);assert.equal(r.consent.student_id_type,'passport');assert.equal(r.consent.student_id_number,'001AB23456789');assert.equal(r.consent.parent_id_number,'XY12345');
});
test('legacy Israeli ID submissions default to Israeli IDs',async()=>{
  const r=await backend().submit(consent);assert.equal(r.status,200);assert.equal(r.consent.student_id_type,'israeli_id');assert.equal(r.consent.parent_id_type,'israeli_id');
});
test('server rejects invalid documents, unknown types and incorrect ID checksums',async()=>{
  for(const patch of [{student_id_type:'passport',student_id_number:'AB 12345'},{parent_id_type:'passport',parent_id_number:'AB-12345'},{student_id_type:'drivers_license'},{student_id_number:'123456783'},{student_id_type:'israeli_id',student_id_number:'AB123456782'}]) {
    const r=await backend().submit({...consent,...patch});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_CONSENT');assert.equal(r.consent,undefined);
  }
});
test('passport submissions still require verification proof',async()=>{
  const r=await backend().submit({...consent,student_id_type:'passport',student_id_number:'AB123456'},'');assert.equal(r.status,403);assert.equal(r.consent,undefined);
});
