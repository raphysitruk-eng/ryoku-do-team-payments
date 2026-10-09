import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../portal.js', import.meta.url), 'utf8');
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
  vm.runInContext(source,context);
  vm.runInContext('profile={id:"parent"};children=[{id:"first",first_name:"First",last_name:"Child"},{id:"second",first_name:"Second",last_name:"Child"}];portalCall=async()=>({payments:[]});',context);
  return {context,get,sb};
}
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
