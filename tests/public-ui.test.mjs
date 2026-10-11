import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../portal.js', import.meta.url), 'utf8');
const gaugeSource = await readFile(new URL('../belt-gauge.js', import.meta.url), 'utf8');
class Element {
  constructor(){this.innerHTML='';this.textContent='';this.style={};this.attrs={};this.classes=new Set(['hidden']);this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  append(...nodes){this.children=nodes;}
}
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(resolveQuery){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const sb={auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>{},getUser:async()=>({data:{user:{id:'parent'}}})},from(table){let id='';const chain=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve().then(()=>resolveQuery(table,id)).then(resolve,reject);return (...args)=>{if(key==='eq'&&args[0]==='child_id')id=args[1];return chain;};}});return chain;}};
  const context=vm.createContext({window:{supabase:{createClient:()=>sb},sessionStorage:{}},document:{getElementById:get,querySelectorAll:()=>[]},URL,Date,Map,Promise,console});
  vm.runInContext(gaugeSource,context);
  vm.runInContext(source,context);
  vm.runInContext('profile={id:"parent"};children=[{id:"first",first_name:"First",last_name:"Child"},{id:"second",first_name:"Second",last_name:"Child"}];portalCall=async()=>({payments:[]});',context);
  return {context,get,sb};
}
test('belt gauges use the saved percentage and current belt color',async()=>{
  for(const [rank,color,percent] of [['לבנה','white',0],['צהובה','yellow',17],['כתומה','orange',33],['ירוקה','green',50],['כחולה','blue',67],['חומה','brown',83],['שחורה','black',100]]){
    const f=fixture(table=>table==='student_progress'?{data:{progress_percent:percent}}:{data:[]});
    f.context.testRank=rank;
    vm.runInContext('children[0].current_rank=testRank',f.context);
    await vm.runInContext('selectChild("first")',f.context);
    const html=f.get('progressFill').innerHTML;
    assert.match(html,new RegExp(`data-belt="${color}"`));
    assert.match(html,new RegExp(`aria-valuenow="${percent}"`));
    assert.equal(f.get('progressPercent').textContent,`${percent}%`);
  }
});
test('unavailable progress has no zero-percent gauge or pointer',async()=>{
  const f=fixture(table=>table==='student_progress'?{data:null,error:{message:'offline'}}:{data:[]});
  await vm.runInContext('selectChild("first")',f.context);
  assert.equal(f.get('progressPercent').textContent,'—');
  assert.doesNotMatch(f.get('progressFill').innerHTML,/aria-valuenow|class="belt-gauge__needle"|>0%/);
});
test('a late child response cannot replace the selected child or its billing view',async()=>{
  let release;const slow=new Promise(resolve=>release=resolve);
  const f=fixture((table,id)=>table==='student_progress'?(id==='first'?slow:{data:{monthly_goal:'Second goal'}}):{data:[]});
  const first=vm.runInContext('selectChild("first")',f.context);await settle();
  await vm.runInContext('selectChild("second")',f.context);
  assert.equal(f.get('monthlyGoal').textContent,'Second goal');
  release({data:{monthly_goal:'First goal'}});await first;
  assert.equal(f.get('monthlyGoal').textContent,'Second goal');assert.match(f.get('childProfile').innerHTML,/Second Child/);
});
test('a failed section displays an unavailable state while other sections stay usable',async()=>{
  const f=fixture(table=>table==='attendance'?Promise.reject(new Error('offline')):table==='achievements'?{data:null,error:{message:'unavailable'}}:table==='student_progress'?{data:{monthly_goal:'Loaded goal'}}:{data:[]});
  await vm.runInContext('selectChild("first")',f.context);
  assert.equal(f.get('monthlyGoal').textContent,'Loaded goal');assert.match(f.get('attendanceList').innerHTML,/לא ניתן לטעון/);assert.match(f.get('achievementList').innerHTML,/לא ניתן לטעון/);assert.equal(f.get('attendanceCount').textContent,'—');assert.equal(f.get('childArea').attrs['aria-busy'],undefined);
});
test('signing out invalidates pending child and account loads immediately',async()=>{
  let release;const slow=new Promise(resolve=>release=resolve);const f=fixture(table=>table==='student_progress'?slow:{data:[]});
  const pending=vm.runInContext('selectChild("first")',f.context);await settle();await vm.runInContext('signOut()',f.context);release({data:{monthly_goal:'Private goal'}});await pending;
  assert.equal(f.get('childArea').classes.has('hidden'),true);assert.notEqual(f.get('monthlyGoal').textContent,'Private goal');
  let userReply;f.sb.auth.getUser=()=>new Promise(resolve=>userReply=resolve);
  const loading=vm.runInContext('loadPortal()',f.context);await vm.runInContext('signOut()',f.context);userReply({data:{user:{id:'parent'}}});await loading;
  assert.equal(vm.runInContext('profile',f.context),null);
});
test('quotes in approved HTTPS resources stay inside their attribute',async()=>{
  const f=fixture(table=>table==='achievements'?{data:[{title:'Certificate',certificate_url:"https://example.test/cert' data-unexpected='value"}]}:{data:[]});
  await vm.runInContext('selectChild("first")',f.context);
  assert.match(f.get('achievementList').innerHTML,/cert&#39; data-unexpected=&#39;value/);
});
test('recovery links accept only the configured project over HTTPS',async()=>{
  const src=await readFile(new URL('../recover.js',import.meta.url),'utf8');
  for(const [url,valid] of [["https://zwgpvwxdofjidshsiaek.supabase.co/auth/v1/verify?type=recovery&token=fixture",true],["https://other-project.supabase.co/auth/v1/verify?type=recovery",false],["http://zwgpvwxdofjidshsiaek.supabase.co/auth/v1/verify?type=recovery",false],["https://zwgpvwxdofjidshsiaek.supabase.co/auth/v1/verify?type=signup",false],["https://user:pass@zwgpvwxdofjidshsiaek.supabase.co/auth/v1/verify?type=recovery",false]]){
    const state=new Element();vm.runInNewContext(src,{document:{getElementById:()=>state,createElement:()=>new Element()},location:{search:'?confirmation_url='+encodeURIComponent(url)},URL,URLSearchParams});assert.equal(!!state.children,valid,url);
  }
});
test('a personal registration link works when browser storage is denied',async()=>{
  const src=await readFile(new URL('../parent.js',import.meta.url),'utf8'),nodes=new Map();let sent;
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const blocked={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}};
  vm.runInNewContext(src,{window:{},document:{getElementById:get,querySelectorAll:()=>[]},location:{search:'?token=fixture-personal-token',pathname:'/parent.html'},history:{replaceState(){}},sessionStorage:blocked,URLSearchParams,URL,fetch:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({masked_phone:'1234'})};},console});
  await settle();assert.deepEqual(sent,{action:'public_get',token:'fixture-personal-token'});assert.equal(get('verify').classes.has('hidden'),false);
});
test('portal authentication can use a temporary tab session when storage is blocked',()=>{
  const f=fixture(()=>({data:[]}));
  Object.defineProperty(f.context.window,'sessionStorage',{get(){throw new Error('denied');}});
  vm.runInContext('portalStorage.setItem("fixture-session","fixture-token")',f.context);
  assert.equal(vm.runInContext('portalStorage.getItem("fixture-session")',f.context),'fixture-token');
  vm.runInContext('portalStorage.removeItem("fixture-session")',f.context);
  assert.equal(vm.runInContext('portalStorage.getItem("fixture-session")',f.context),null);
});

const adminSource=await readFile(new URL('../admin.js',import.meta.url),'utf8');
function adminFixture(reply){
  const nodes=new Map(),sent=[];
  const get=id=>{if(!nodes.has(id)){
    const node=new Element();node.value='';node.checked=false;node.disabled=false;node.events={};
    node.classList.toggle=(name,on)=>{if(on??!node.classes.has(name))node.classes.add(name);else node.classes.delete(name);};
    node.addEventListener=(name,fn)=>node.events[name]=fn;node.focus=()=>{};node.reportValidity=()=>true;
    node.showModal=()=>node.open=true;node.close=()=>node.open=false;nodes.set(id,node);
  }return nodes.get(id);};
  const sb={rpc:async()=>({data:17,error:null}),auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async()=>{}}};
  const context=vm.createContext({window:{supabase:{createClient:()=>sb},sessionStorage:{},RyokuAdminUI:{activeTab:'payments',updateSummary(){},updateAttention(){},onChange(){}}},document:{getElementById:get,querySelectorAll:()=>[]},location:{hash:'',pathname:'/admin.html',search:''},URLSearchParams,URL,Date,Math,Number,String,Object,Map,Set,Promise,setTimeout,clearTimeout,console,confirm:()=>true,alert(){},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);sent.push(body);const response=await reply(body);
    return {ok:(response?.status||200)<400,status:response?.status||200,json:async()=>response?.data||{}};
  }});
  vm.runInContext(gaugeSource,context);vm.runInContext(adminSource,context);
  vm.runInContext('jwt="test-session";adminReady=true;',context);
  return {context,get,sent,sb};
}
const studentReply=id=>({data:{child:{id,parent_id:'parent-'+id,first_name:id,last_name:'Student',student_id_type:'passport',student_id_number:'GB725469',current_rank:'צהובה'},parent:{full_name:'Parent '+id},progress:{progress_percent:17}}});

test('admin section failures keep the signed-in session and other sections usable',async()=>{
  const f=adminFixture(body=>({data:body.action==='admin_settings'?{settings:{}}:body.action==='admin_list'?{requests:[{id:'one',student_name:'Loaded student'}],total:1}:body.action==='admin_summary'?{code:'SERVICE_UNAVAILABLE'}:{attention:{}},status:body.action==='admin_summary'?503:200}));
  await vm.runInContext('load()',f.context);
  assert.equal(vm.runInContext('jwt',f.context),'test-session');assert.equal(f.get('login').classes.has('hidden'),true);assert.equal(f.get('app').classes.has('hidden'),false);
  assert.match(f.get('rows').innerHTML,/Loaded student/);assert.match(f.get('overviewUpdated').textContent,/לא ניתן/);
  assert.equal(f.sent.some(x=>['admin_students','admin_open_mat_list','admin_grade_exam_list'].includes(x.action)),false);
});
test('payment search loads only the payment list and preserves the overview totals',async()=>{
  const f=adminFixture(()=>({data:{requests:[],page:1,total_pages:1,total:0}}));
  vm.runInContext('renderSummary({all:20,pending:5,active:10,monthly_agorot:150000})',f.context);
  f.get('search').value='missing';await vm.runInContext('loadPayments()',f.context);
  assert.deepEqual(f.sent.map(x=>x.action),['admin_list']);assert.equal(f.get('mAll').textContent,20);assert.equal(f.get('mActive').textContent,10);assert.match(f.get('mMoney').textContent,/1,500/);
});
test('late payment responses cannot replace the latest search',async()=>{
  let release;const firstReply=new Promise(resolve=>release=resolve);
  const f=adminFixture(body=>body.search==='first'?firstReply:{data:{requests:[{id:'second',student_name:'Latest search'}],total:1}});
  f.get('search').value='first';const first=vm.runInContext('loadPayments()',f.context);await settle();
  f.get('search').value='second';await vm.runInContext('loadPayments()',f.context);
  release({data:{requests:[{id:'first',student_name:'Old search'}],total:1}});await first;
  assert.match(f.get('rows').innerHTML,/Latest search/);assert.doesNotMatch(f.get('rows').innerHTML,/Old search/);
});
test('only an authorization failure returns the admin to the login screen',async()=>{
  const offline=adminFixture(()=>Promise.reject(new Error('offline')));await vm.runInContext('loadPayments()',offline.context);
  assert.equal(vm.runInContext('jwt',offline.context),'test-session');assert.match(offline.get('rows').innerHTML,/paymentsRetry/);
  const denied=adminFixture(()=>({status:401,data:{code:'UNAUTHORIZED'}}));await vm.runInContext('loadPayments()',denied.context);
  assert.equal(vm.runInContext('jwt',denied.context),'');assert.equal(denied.get('app').classes.has('hidden'),true);assert.equal(denied.get('login').classes.has('hidden'),false);
});
test('a temporary MFA service failure preserves the saved session for retry',async()=>{
  const f=adminFixture(()=>({data:{}}));await settle();let signouts=0;
  f.sb.auth.getSession=async()=>({data:{session:{access_token:'saved-session'}}});
  f.sb.auth.signOut=async()=>{signouts++;};
  f.sb.auth.mfa={getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'},error:null}),listFactors:async()=>({data:{},error:{status:503,message:'temporarily unavailable'}})};
  await vm.runInContext('completeLogin()',f.context);
  assert.equal(vm.runInContext('jwt',f.context),'saved-session');assert.equal(signouts,0);assert.equal(f.get('loginRetry').classes.has('hidden'),false);assert.match(f.get('loginMsg').textContent,/החיבור נשמר/);
});
test('closing and switching a loading student clears old data and keeps saving locked',async()=>{
  const releases={};const f=adminFixture(body=>new Promise(resolve=>releases[body.child_id]=resolve));
  const first=vm.runInContext('openStudent("first")',f.context);await settle();
  assert.equal(f.get('studentSave').disabled,true);await f.get('studentSave').onclick();assert.equal(f.sent.length,1);
  f.get('studentClose').onclick();const second=vm.runInContext('openStudent("second")',f.context);await settle();
  releases.first(studentReply('first'));await first;
  assert.equal(vm.runInContext('currentStudentDetail',f.context),null);assert.equal(f.get('studentSave').disabled,true);assert.equal(f.get('sStudentId').value,'');
  releases.second(studentReply('second'));await second;
  assert.equal(vm.runInContext('currentStudentDetail.child.id',f.context),'second');assert.equal(f.get('studentSave').disabled,false);assert.equal(f.get('sStudentIdType').value,'passport');assert.equal(f.get('sStudentId').value,'GB725469');
});
test('a failed student load cannot save a previous student record',async()=>{
  const f=adminFixture(()=>({status:503,data:{code:'SERVICE_UNAVAILABLE'}}));await vm.runInContext('openStudent("first")',f.context);await f.get('studentSave').onclick();
  assert.equal(f.get('studentSave').disabled,true);assert.equal(vm.runInContext('currentStudentDetail',f.context),null);assert.equal(f.sent.length,1);assert.match(f.get('studentMore').innerHTML,/studentRetry/);
});
test('student save prevents duplicate writes and preserves the document type',async()=>{
  let release;const saving=new Promise(resolve=>release=resolve);
  const f=adminFixture(body=>body.action==='admin_student_detail'?studentReply(body.child_id):body.action==='admin_student_update'?saving:{data:{students:[]}});
  await vm.runInContext('openStudent("second")',f.context);const first=f.get('studentSave').onclick();await settle();await f.get('studentSave').onclick();
  const writes=f.sent.filter(x=>x.action==='admin_student_update');assert.equal(writes.length,1);assert.equal(writes[0].child_id,'second');assert.equal(writes[0].child.student_id_type,'passport');assert.equal(f.get('studentClose').disabled,true);
  release({data:{ok:true}});await first;assert.equal(f.get('studentSave').disabled,false);assert.equal(f.get('studentClose').disabled,false);assert.match(f.get('studentSaveMsg').textContent,/נשמר/);
});
test('open mat approval requires payment evidence and reports concurrent changes',async()=>{
  const f=adminFixture(()=>({status:409,data:{code:'STALE_RECORD'}}));
  vm.runInContext('openMatEdit={reference:"OM-123456789ABC",updated_at:"2026-10-11T12:00:00Z",payment_status:"reported_unverified"}',f.context);
  f.get('openMatModal').showModal();f.get('openMatEditPayment').value='verified';f.get('openMatEditBooking').value='approved';f.get('openMatNote').value='Verified payment';
  await f.get('openMatEditForm').onsubmit({preventDefault(){}});assert.equal(f.sent.length,0);assert.match(f.get('openMatSaveMsg').textContent,/יש לאשר/);
  f.get('openMatConfirmed').checked=true;await f.get('openMatEditForm').onsubmit({preventDefault(){}});
  assert.equal(f.sent[0].action,'admin_open_mat_update');assert.equal(f.sent[0].payment_confirmed,true);assert.equal(f.get('openMatModal').open,true);assert.match(f.get('openMatSaveMsg').textContent,/עודכנה בינתיים/);assert.equal(f.get('openMatSave').disabled,false);
});

