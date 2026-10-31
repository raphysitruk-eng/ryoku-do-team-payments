(function(){
"use strict";
const API="https://zwgpvwxdofjidshsiaek.supabase.co";
const KEY="sb_publishable_ghdkoJZwwRIvKTsRJXr2xA_Jhfi9NS6";
const sb=window.supabase?.createClient(API,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const H=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const I=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"></use></svg>';
const vlabels={overview:"לוח בקרה",students:"חניכים והורים",roster:"קליטת רשימות",groups:"סניפים וקבוצות",sessions:"אימונים ונוכחות",leads:"פניות והרשמות",tasks:"משימות ומעקב",videos:"ספריית הדרכה",payments:"כספים וחיובים",content:"תוכן, ציוד ואירועים",integrations:"חיבורים ותשתיות",access:"משתמשים והרשאות",audit:"יומן פעילות"};
const types={lead:"פנייה",task:"משימה",event:"אירוע",product:"מוצר",resource:"חומר לימוד"};
const leadStages=[["new","חדש"],["contacted","יצרנו קשר"],["booked","נקבע שיעור"],["attended","השתתף"],["registered","נרשם"],["closed","נסגר"]];
const taskStages=[["open","פתוח"],["in_progress","בטיפול"],["done","הושלם"],["cancelled","בוטל"]];
const S={user:null,profile:null,view:"overview",stats:{},identity:{},sets:{},fail:{},videos:[],roster:[],integrationHealth:null,integrationBusy:false,rankGrants:[],groupGrants:[],profiles:[],profileGrants:[],childGrants:[],blocks:[],audit:[],search:"",page:0,pageSize:25,busy:false,dirty:false,lastFocus:null,drawer:null,finance:null,advanced:false};
const opt=(v,label,selected)=>'<option value="'+H(v)+'"'+(String(v)===String(selected)?" selected":"")+'>'+H(label)+'</option>';
const toast=(message,error)=>{const a=document.createElement("div");a.className="toast"+(error?" error":"");a.innerHTML=I(error?"info":"check")+'<span>'+H(message)+'</span>';$("toastStack").appendChild(a);setTimeout(()=>a.remove(),5000)};
const asArr=(x)=>Array.isArray(x)?x:[];
const rows=kind=>asArr(S.sets[({lead:"leads",task:"tasks",student:"students",group:"groups",session:"sessions"})[kind]||kind]);
const errorOf=kind=>S.fail[kind]||"";
const nameChild=c=>[c.first_name,c.last_name].filter(Boolean).join(" ")||"ללא שם";
const nameGroup=id=>rows("groups").find(g=>g.id===id)?.name||"—";
const localDateTime=d=>{
 if(!d)return "";
 const date=new Date(d);if(!Number.isFinite(date.getTime()))return "";
 const fields=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));
 return fields.year+"-"+fields.month+"-"+fields.day+"T"+fields.hour+":"+fields.minute;
};
const formatDate=d=>{if(!d)return"—";let x=new Date(d);return Number.isNaN(x.getTime())?"—":x.toLocaleDateString("he-IL",{day:"numeric",month:"short",year:"numeric"})};
const formatTime=d=>{if(!d)return"—";let x=new Date(d);return Number.isNaN(x.getTime())?"—":x.toLocaleString("he-IL",{dateStyle:"short",timeStyle:"short"})};
const tag=(text,kind="")=>'<span class="tag '+H(kind)+'">'+H(text)+'</span>';
const button=(act,text,cls="",id="")=>'<button type="button" class="btn '+H(cls)+'" data-action="'+H(act)+'"'+(id?' data-id="'+H(id)+'"':"")+'>'+text+'</button>';
const header=(title,desc,actions="")=>'<div class="content-head"><div><div class="eyebrow">RYOKU-DO CONTROL CENTER</div><h1>'+H(title)+'</h1><p>'+H(desc)+'</p></div><div class="actions">'+actions+'</div></div>';
const panel=(title,body,extra="")=>'<section class="panel"><div class="panel-head"><h2>'+H(title)+'</h2>'+extra+'</div>'+body+'</section>';
const empty=(title,msg)=>'<div class="empty"><span class="empty-icon">'+I("info")+'</span><strong>'+H(title)+'</strong>'+H(msg||"")+'</div>';
const metric=(title,num,detail,icon,color="")=>'<div class="metric '+color+'"><div class="label"><span>'+H(title)+'</span><span class="icon-swatch">'+I(icon)+'</span></div><div class="number">'+H(num)+'</div><div class="note">'+H(detail)+'</div></div>';
const message=txt=>'<div class="alert-bar">'+I("info")+'<span>'+H(txt)+'</span></div>';
const table=(headers,body,cls="")=>{
 const pages=Math.max(1,Math.ceil(body.length/S.pageSize)),index=Math.min(S.page,pages-1);
 const chunk=body.slice(index*S.pageSize,(index+1)*S.pageSize);
 const pager=pages>1?'<div class="table-pager" role="navigation" aria-label="דפדוף בטבלה"><span>מציג '+(index*S.pageSize+1)+'–'+Math.min(body.length,(index+1)*S.pageSize)+' מתוך '+body.length+'</span><div>'+
 '<button type="button" data-page="'+(index-1)+'" '+(index===0?'disabled':'')+' aria-label="עמוד קודם">הקודם</button>'+
 '<span>עמוד '+(index+1)+' מתוך '+pages+'</span>'+
 '<button type="button" data-page="'+(index+1)+'" '+(index>=pages-1?'disabled':'')+' aria-label="עמוד הבא">הבא</button></div></div>':'';
 return '<div class="table-wrap"><table class="data-table '+cls+'"><thead><tr>'+headers.map(x=>'<th scope="col">'+H(x)+'</th>').join("")+'</tr></thead><tbody>'+chunk.join("")+'</tbody></table>'+pager+'</div>';
};
function login(msg,show=true){
 $("shell").classList.add("hide");$("authGate").classList.remove("hide");$("gateMessage").textContent=msg||"כניסה למנהלים מורשים בלבד";
 $("loginForm").classList.toggle("hide",!show);
}
function requireData(res){if(res.error)throw res.error;if(res.data?.ok===false)throw Error(res.data.error||"הפעולה נכשלה");return res.data}
async function command(action,payload={},requestId=null){return requireData(await sb.rpc("academy_command",{p_action:action,p_payload:payload,p_request_id:requestId}))}
async function listed(kind,params={}){
 const res=await command("list",{kind,...params});
 return asArr(res.items);
}
function missingAuth(err){return ["AuthSessionMissingError","session_not_found","auth_session_missing"].includes(err?.name)||/auth session missing|session missing/i.test(String(err?.message||""))}
async function init(){
 if(!sb){login("שירות האימות לא נטען. בדוק חיבור לאינטרנט.",false);return}
 try{
  const sr=await sb.auth.getSession();
  if(sr.error){if(missingAuth(sr.error)){login("יש להתחבר עם חשבון מנהל.",true);return}throw sr.error}
  if(!sr.data?.session){login("יש להתחבר עם חשבון מנהל.",true);return}
  const u=await sb.auth.getUser();
  if(u.error){if(missingAuth(u.error)){login("פג תוקף ההתחברות. יש להתחבר שוב.",true);return}throw u.error}
  S.user=u.data?.user;
  if(!S.user){login("יש להתחבר עם חשבון מנהל.",true);return}
  S.profile=requireData(await sb.from("profiles").select("id,role,approval_status,full_name,email").eq("id",S.user.id).single());
  if(S.profile.role!=="admin"||S.profile.approval_status!=="approved"){login("החשבון אינו מורשה לניהול האקדמיה. ניתן להיכנס עם חשבון מנהל מאושר בלבד.",true);return}
  $("authGate").classList.add("hide");$("shell").classList.remove("hide");
  const name=S.profile.full_name||S.profile.email||"מנהל";
  $("accountName").textContent=name;$("accountAvatar").textContent=name.slice(0,1);
  await refresh();
 }catch(e){login("לא ניתן לטעון נתונים: "+(e.message||"שגיאת חיבור"),true)}
}
async function refresh(){
 const jobs=[
  ["stats",()=>command("dashboard")],["identity",()=>command("identity")],
  ["students",()=>listed("students")],["roster",()=>sb.rpc("ryokudo_roster_preview").then(requireData)],["groups",()=>listed("groups")],
  ["memberships",()=>listed("memberships")],["sessions",()=>listed("sessions")],
  ["leads",()=>listed("lead")],["tasks",()=>listed("task")],
  ["videos",()=>sb.from("training_videos").select("id,title_he,description_he,category,provider,provider_asset_id,status,source_url,variant,rank_hint,sort_order,updated_at").order("sort_order",{ascending:true}).limit(1000).then(requireData)],
  ["rankGrants",()=>sb.from("training_video_rank_grants").select("video_id,rank_key").limit(1000).then(requireData)],
  ["groupGrants",()=>sb.from("training_video_group_grants").select("video_id,group_id").limit(1000).then(requireData)],
  ["profiles",()=>sb.from("profiles").select("id,full_name,email,phone,role,approval_status").order("full_name").limit(1000).then(requireData)],
  ["profileGrants",()=>sb.from("training_video_profile_grants").select("*").limit(1000).then(requireData)],
  ["childGrants",()=>sb.from("training_video_child_grants").select("*").limit(1000).then(requireData)],
  ["blocks",()=>sb.from("training_library_blocks").select("*").limit(1000).then(requireData)],
  ["audit",()=>sb.from("training_video_audit").select("id,changed_at,actor,table_name,action").order("id",{ascending:false}).limit(150).then(requireData)]
 ];
 let results=await Promise.allSettled(jobs.map(x=>x[1]()));
 results.forEach((r,i)=>{
  let key=jobs[i][0];
  if(r.status==="rejected"){
   S.fail[key]=String(r.reason?.message||r.reason);
   if(key==="stats")S.stats={};
   else if(key==="identity")S.identity={};
   else if(key==="videos")S.videos=[];
   else if(key==="roster")S.roster=[];
   else if(["rankGrants","groupGrants","profiles","profileGrants","childGrants","blocks","audit"].includes(key))S[key]=[];
   else S.sets[key]=[];
   return;
  }
  delete S.fail[key];const data=r.value;
  if(key==="stats")S.stats=data;
  else if(key==="identity")S.identity=data;
  else if(key==="videos")S.videos=asArr(data);
  else if(key==="roster")S.roster=asArr(data.records);
  else if(key==="rankGrants")S.rankGrants=asArr(data);
  else if(key==="groupGrants")S.groupGrants=asArr(data);
  else if(["profiles","profileGrants","childGrants","blocks","audit"].includes(key))S[key]=asArr(data);
  else S.sets[key]=asArr(data);
 });
 $("navVideoCount").textContent=String(S.videos.length);
 render();
 void refreshIntegrationHealth();

}
async function refreshIntegrationHealth(){
 if(S.integrationBusy||S.profile?.role!=="admin")return;
 S.integrationBusy=true;
 try{
  S.integrationHealth=requireData(await sb.functions.invoke("ryokudo-integration-status"));
  delete S.fail.integrationHealth;
 }catch(error){
  S.integrationHealth=null;S.fail.integrationHealth=String(error?.message||error||"בדיקת החיבורים נכשלה");
 }finally{
  S.integrationBusy=false;
  if(S.view==="overview"||S.view==="integrations")render();
 }
}

function navigate(view){
 if(!vlabels[view])return;
 if(S.drawer&&!hideDrawer())return;
 S.view=view;S.search="";S.page=0;
 const url=new URL(location.href);url.searchParams.set("view",view);
 history.replaceState(null,"",url.pathname+url.search);
 document.querySelectorAll("[data-view]").forEach(el=>{
  el.classList.toggle("active",el.dataset.view===view);
  if(el.dataset.view===view)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");
 });
 $("currentPageLabel").textContent=vlabels[view];
 $("sidebar").classList.remove("open");$("mobileShade").classList.remove("show");
 if(view==="content"&&!S.sets.event)loadContent();
 if(view==="payments"&&S.identity.finance_access&&!S.finance)loadFinance();
 if(view==="integrations"&&!S.integrationHealth)void refreshIntegrationHealth();
 render();$("content").focus();
}
function render(){
 $("currentPageLabel").textContent=vlabels[S.view];
 document.querySelectorAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===S.view));
 const pages={overview:overview,students:students,roster:rosterPage,groups:groups,sessions:sessions,leads:leads,tasks:tasks,videos:videos,payments:payments,content:content,integrations:integrations,access:access,audit:auditPage};
 $("content").innerHTML=pages[S.view]();
}
function filtered(list,getText){const q=S.search.trim().toLowerCase();return q?list.filter(x=>String(getText(x)).toLowerCase().includes(q)):list}
function searchField(placeholder){return '<div class="toolbar"><label class="searchbox">'+I("search")+'<input id="searchInput" value="'+H(S.search)+'" placeholder="'+H(placeholder)+'" aria-label="חיפוש"></label></div>'}
function incomplete(key){return errorOf(key)?message("לא ניתן לטעון את המודול כרגע: "+errorOf(key)):""}
function overview(){
 const st=S.stats||{},financeSecure=Boolean(S.identity?.finance_access);
 const students=rows("students"),groups=rows("groups"),leads=rows("leads"),tasks=rows("tasks");
 const activeTasks=tasks.filter(x=>x.status==="open"||x.status==="in_progress");
 const openLeads=leads.filter(x=>!["registered","closed"].includes(x.status));
 const dueTasks=activeTasks.filter(x=>x.due_at&&new Date(x.due_at)<=new Date());
 const totalVideos=S.videos.length,published=S.videos.filter(x=>x.status==="published").length;
 const drafts=S.videos.filter(x=>x.status==="draft").length,archived=Math.max(0,totalVideos-published-drafts);
 const p1=totalVideos?Math.round(published/totalVideos*100):0;
 const p2=totalVideos?Math.min(100,Math.round((published+drafts)/totalVideos*100)):0;
 const metricText=(key,value)=>S.fail[key]?"—":String(value);
 const numbers='<div class="metric-grid">'+
 metric("חניכים במערכת",metricText("students",st.students??students.filter(x=>x.active).length),"לפי הרשומות הקיימות","users")+
 metric("קבוצות פעילות",metricText("groups",st.groups??groups.filter(x=>x.active).length),"לפי סניפים וקבוצות","book","teal")+
 metric("פניות פתוחות",metricText("leads",st.open_leads??openLeads.length),"מתעניינים למעקב","search","amber")+
 metric("משימות דחופות",metricText("tasks",st.tasks_due??dueTasks.length),"משימות שהגיע מועדן","clock","rose")+'</div>';
 const hero='<section class="hero-card"><div><div class="eyebrow">ONE ACADEMY · ONE WORKSPACE</div><h2>הכול מתחיל כאן.</h2><p>ניהול הפעילות, המעקב אחר חניכים, תפעול הקבוצות ותכני האקדמיה — מסביבת עבודה אחת, עם הרשאות המערכת הקיימות.</p></div>'+button("new-task",I("plus")+" יצירת משימה","primary")+'</section>';
 const pipelineStages=[["new","פנייה חדשה"],["contacted","יצרנו קשר"],["booked","תואם שיעור"],["attended","הגיע לשיעור"],["registered","נרשם"]];
 const max=Math.max(1,...pipelineStages.map(x=>leads.filter(y=>y.status===x[0]).length));
 const pipeline='<div class="funnel">'+pipelineStages.map(stage=>{
  const count=leads.filter(y=>y.status===stage[0]).length;
  return '<div class="funnel-line"><span>'+H(stage[1])+'</span><div class="funnel-track"><div class="funnel-fill" style="width:'+(count?Math.max(6,Math.round(count/max*100)):0)+'%"></div></div><strong>'+count+'</strong></div>'
 }).join("")+'</div>';
 const donut='<div class="ops-donut"><div class="donut" style="--p1:'+p1+'%;--p2:'+p2+'%" role="img" aria-label="'+H(published+" פורסמו, "+drafts+" טיוטות, "+archived+" בארכיון")+'"><div class="donut-inside"><strong>'+totalVideos+'</strong><span>סרטונים</span></div></div>'+
 '<div class="legend"><div class="legend-row"><span class="legend-marker"></span>מפורסמים<strong>'+published+'</strong></div><div class="legend-row"><span class="legend-marker gold"></span>טיוטות<strong>'+drafts+'</strong></div><div class="legend-row"><span class="legend-marker slate"></span>בארכיון<strong>'+archived+'</strong></div></div></div>';
 const modules=[
 ["students","חניכים והורים",students.length+" רשומות","users"],
 ["roster","קליטת רשימות",S.roster.length+" רשומות לבקרה","book"],
 ["groups","סניפים וקבוצות",groups.length+" קבוצות","book"],
 ["sessions","אימונים ונוכחות",rows("sessions").length+" מפגשים בתקופה","check"],
 ["leads","פניות והרשמות",openLeads.length+" פתוחות","search"],
 ["tasks","משימות ומעקב",activeTasks.length+" פעילות","clock"],
 ["videos","ספריית הדרכה",totalVideos+" סרטונים","film"],
 ["payments","כספים וחיובים",financeSecure?"גישה עם MFA":"דורש MFA","shield"],
 ["content","תוכן ואירועים","אירועים, מוצרים ומסמכים","settings"]
 ];
 const grid='<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(218px,1fr));gap:12px">'+modules.map(m=>
 '<button class="quick-link" data-go="'+m[0]+'">'+I(m[3])+'<span><strong style="display:block">'+H(m[1])+'</strong><small class="muted">'+H(m[2])+'</small></span><span style="margin-right:auto;color:#8293a0">'+I("chevron")+'</span></button>').join("")+'</div>';
 const pending=activeTasks.slice().sort((a,b)=>String(a.due_at||"9999").localeCompare(String(b.due_at||"9999"))).slice(0,5);
 const taskList=pending.length?pending.map(x=>'<button class="activity-spot" style="width:100%;border-top:0;border-right:0;border-left:0;background:none;cursor:pointer;text-align:right" data-item="task" data-id="'+H(x.id)+'"><span class="spot-icon">'+I("clock")+'</span><span><strong>'+H(x.title||"משימה")+'</strong><small>'+H(x.due_at?formatDate(x.due_at):"ללא תאריך יעד")+'</small></span><span style="margin-right:auto">'+tag(x.status==="in_progress"?"בטיפול":"פתוחה","draft")+'</span></button>').join(""):empty("אין משימות פתוחות","כל המשימות הושלמו או טרם נפתחו");
 const leadPanel=panel("משפך פניות",pipeline,'<button class="tiny-link" data-go="leads">לכל הפניות '+I("chevron")+'</button>');
 const videoPanel=panel("מצב ספריית ההדרכה",donut,'<button class="tiny-link" data-go="videos">ניהול סרטונים '+I("chevron")+'</button>');
 const taskPanel=panel("המשימות הקרובות",'<div class="quick-list">'+taskList+'</div>','<button class="tiny-link" data-go="tasks">צפה בכל המשימות '+I("chevron")+'</button>');
 const statuses=[
 ["ניהול חניכים וקבוצות",!S.fail.students&&!S.fail.groups,"מידע מתוך Supabase"],
 ["ניהול ספריית הווידאו",!S.fail.videos,S.videos.length+" סרטונים בקטלוג"],
 ["כספים וחיובים",financeSecure,"נתונים מוגנים ב־MFA"],
 ["WhatsApp לשליחה לקבוצות",S.integrationHealth?.whatsapp?.send_ready===true,S.integrationHealth?.whatsapp?.mode==="demo"?"שרת פעיל במצב הדגמה; לא שולח לקבוצות":"מצב שליחה אינו מאומת"]
 ];
 const syncPanel=panel("מפת מערכות",statuses.map(x=>
  '<div class="subrow"><div><strong>'+H(x[0])+'</strong><small class="muted" style="display:block">'+H(x[2])+'</small></div><span class="control-chip '+(x[1]?"":"warning")+'"><span class="dot"></span>'+(x[1]?"זמין":"מוגבל")+'</span></div>').join(""),
  '<button class="tiny-link" data-go="integrations">כל החיבורים '+I("chevron")+'</button>');
 let errors=Object.keys(S.fail);const note=errors.length?message("חלק מהמודולים לא נטענו: "+errors.join(", ")+". ניתן לרענן או לבדוק את הרשאות המודול."):"";
 return header("לוח הבקרה המרכזי","מבט מרוכז על הפעילות, השירות והתוכן באקדמיה",button("refresh",I("refresh")+" רענון נתונים","secondary"))+
 hero+numbers+note+'<div class="ops-grid">'+leadPanel+videoPanel+'</div>'+
 '<div style="margin-top:18px">'+panel("ניהול ופעולות",grid)+'</div>'+
 '<div class="ops-grid">'+taskPanel+syncPanel+'</div>'+
 '<div class="alert-bar">'+I("shield")+'<span>נתונים כספיים מחייבים אימות דו־שלבי. שירותים חיצוניים עדיין עשויים לדרוש חיבור ייעודי; ריכוז התצוגה אינו מבטל את מערכותיהם.</span></div>';
}
function rosterPage(){
 const raw=asArr(S.roster);
 const entries=filtered(raw,x=>[x.name,asArr(x.files).join(" "),x.batch].join(" "));
 const found=raw.filter(x=>Number(x.existing_matches)>0).length;
 const pending=raw.length-found;
 const repeated=raw.filter(x=>asArr(x.files).length>1).length;
 const items=entries.map(x=>
  '<tr><td><strong>'+H(x.name)+'</strong></td>'+
  '<td>'+asArr(x.files).map(y=>tag("קובץ "+y,"draft")).join(" ")+'</td>'+
  '<td>'+tag(Number(x.existing_matches)===1?"התאמה אפשרית":Number(x.existing_matches)>1?"כמה התאמות":"לא נמצאה התאמה",Number(x.existing_matches)>1?"blocked":Number(x.existing_matches)===1?"allow":"draft")+'</td>'+
  '<td>'+tag("ממתין לבקרה","draft")+'</td></tr>');
 return header("קליטת רשימות וחניכים","רשימות CourseParticipants מ־31 באוקטובר 2026; נתוני המקור נשמרים בנפרד מהחניכים הפעילים")+
 '<div class="metric-grid">'+metric("משתתפים שונים",raw.length,"אחרי הסרת כפילויות מקור","users")+
 metric("התאמות אפשריות",found,"לפי השוואת שמות בלבד","check","teal")+
 metric("טעונים שיוך",pending,"יש לוודא קבוצה וסניף","book","amber")+
 metric("משתתפים בכמה קבצים",repeated,"דורשים בדיקת שיוך","shield")+'</div>'+
 '<div class="alert-bar">'+I("shield")+'<span>הנתונים כאן הם רשימת בקרה מאובטחת, לא רישום חדש לחוגים. שמות הקבצים אינם שמות קבוצות. לא נוצרו שיוכים או חיובים, ויש לאשר התאמת חניך וקבוצה לפני קליטה למאגר הפעיל.</span></div>'+
 incomplete("roster")+
 panel("רשימת ביקורת",searchField("חיפוש לפי שם או מספר קובץ")+
 (items.length?table(["שם מלא","קובצי מקור","התאמה למאגר","מצב"],items):empty("אין רשומות לצפייה","לא הועלו רשימות או שלא נמצאו תוצאות.")));
}
function students(){
 const all=filtered(rows("students"),x=>nameChild(x)+" "+x.branch+" "+x.group_name+" "+x.contact_email);
 const trs=all.map(c=>'<tr><td><strong>'+H(nameChild(c))+'</strong></td><td>'+H(c.current_rank||"לא הוגדרה")+'</td><td>'+H(c.branch||"—")+'</td><td>'+H(c.group_name||"—")+'</td><td>'+tag(c.active?"פעיל":"לא פעיל",c.active?"allow":"draft")+'</td><td><button class="mini-action" data-item="student" data-id="'+H(c.id)+'">פרטים</button></td></tr>');
 return header("חניכים והורים","תמונת תלמידים מתוך מערכת האקדמיה")+incomplete("students")+panel("מאגר חניכים",searchField("שם, סניף או קבוצה")+(trs.length?table(["חניך","דרגה","סניף","קבוצה","מצב","פרטים"],trs):empty("אין חניכים להצגה","לא נמצאו רשומות לחיפוש")));
}
function groups(){
 const all=filtered(rows("groups"),x=>x.name+" "+x.branch+" "+x.code);
 const memberships=rows("memberships");
 const trs=all.map(g=>{const count=memberships.filter(m=>m.group_id===g.id&&m.status==="active").length;return '<tr><td><strong>'+H(g.name)+'</strong><small class="muted" style="display:block">'+H(g.code||"")+'</small></td><td>'+H(g.branch||"—")+'</td><td>'+count+'</td><td>'+H(g.capacity??"—")+'</td><td>'+tag(g.active?"פעילה":"לא פעילה",g.active?"allow":"draft")+'</td><td><button class="mini-action" data-item="group" data-id="'+H(g.id)+'">לצפייה</button></td></tr>'});
 return header("סניפים וקבוצות","קבוצות פעילות ושיוכי חניכים")+
 incomplete("groups")+panel("קבוצות וסניפים",searchField("שם קבוצה, סניף או קוד")+(trs.length?table(["קבוצה","סניף","חניכים רשומים","קיבולת","מצב","פרטים"],trs):empty("לא נמצאו קבוצות","")));
}
function sessions(){
 const all=filtered(rows("sessions"),x=>nameGroup(x.group_id)+" "+x.training_date+" "+x.status);
 const trs=all.map(s=>'<tr><td><strong>'+H(nameGroup(s.group_id))+'</strong></td><td>'+H(s.training_date||"—")+'</td><td>'+H((s.starts_at||"").slice(0,5))+'–'+H((s.ends_at||"").slice(0,5))+'</td><td>'+tag(s.status||"—",s.status==="completed"?"allow":"draft")+'</td><td><button class="mini-action" data-item="session" data-id="'+H(s.id)+'">נוכחות</button></td></tr>');
 return header("אימונים ונוכחות","מפגשים בטווח ברירת המחדל של המערכת: 90 ימים אחורה ו־30 ימים קדימה")+
 incomplete("sessions")+panel("אימונים",searchField("שם קבוצה או תאריך")+(trs.length?table(["קבוצה","תאריך","שעות","מצב","נוכחות"],trs):empty("אין אימונים בתקופה","")));
}
function leads(){
 const all=filtered(rows("leads"),x=>x.title+" "+x.branch+" "+x.status+" "+JSON.stringify(x.data||{}));
 const label=s=>leadStages.find(x=>x[0]===s)?.[1]||s;
 const trs=all.map(x=>'<tr><td><strong>'+H(x.title||"פנייה")+'</strong></td><td>'+H(x.branch||"—")+'</td><td>'+tag(label(x.status),x.status==="registered"?"allow":"draft")+'</td><td>'+H(formatDate(x.created_at))+'</td><td><button class="mini-action" data-item="lead" data-id="'+H(x.id)+'">עדכן סטטוס</button></td></tr>');
 return header("פניות והרשמות","מעקב אחרי מתעניינים משלב הפנייה ועד לרישום")+
 incomplete("leads")+panel("פניות פעילות והיסטוריות",searchField("שם, סניף או סטטוס")+(trs.length?table(["פנייה","סניף","סטטוס","נפתח","ניהול"],trs):empty("לא נמצאו פניות","")));
}
function tasks(){
 const all=filtered(rows("tasks"),x=>x.title+" "+x.branch+" "+x.status);
 const label=s=>taskStages.find(x=>x[0]===s)?.[1]||s;
 const trs=all.map(x=>'<tr><td><strong>'+H(x.title||"משימה")+'</strong></td><td>'+H(x.branch||"כללי")+'</td><td>'+tag(label(x.status),x.status==="done"?"allow":x.status==="cancelled"?"blocked":"draft")+'</td><td>'+H(formatDate(x.due_at))+'</td><td><button class="mini-action" data-item="task" data-id="'+H(x.id)+'">ערוך</button></td></tr>');
 return header("משימות ומעקב","טיפול בפניות, משימות ארגוניות ומעקב ביצוע",button("new-task",I("plus")+" משימה חדשה","primary"))+
 incomplete("tasks")+panel("כל המשימות",searchField("חיפוש משימה או סניף")+(trs.length?table(["משימה","סניף","מצב","יעד","פעולות"],trs):empty("אין משימות","")));
}
const RANKS=[["white","לבנה"],["yellow","צהובה"],["orange","כתומה"],["green","ירוקה"],["blue","כחולה"],["brown","חומה"],["black","שחורה"]];
const VIDEO_CATEGORIES=[["syllabus","סילבוס"],["kata","קאטות"],["kihon","קיהון"],["kumite","קומיטה"],["fitness","כושר"],["coach","מאמנים"],["other","אחר"]];
const VIDEO_STATES=[["draft","טיוטה"],["published","פורסם למורשים"],["archived","ארכיון"]];
const rankLabel=r=>RANKS.find(x=>x[0]===r)?.[1]||r;
const categoryLabel=k=>VIDEO_CATEGORIES.find(x=>x[0]===k)?.[1]||k;
function parseVideoSource(value){
 let u;try{u=new URL(value)}catch(_){throw Error("יש להזין קישור וידאו תקין")}
 if(u.protocol!=="https:")throw Error("קישור הוידאו חייב להיות מאובטח (HTTPS)");
 const h=u.hostname.toLowerCase();
 if(["youtube.com","www.youtube.com","m.youtube.com","www.youtube-nocookie.com","youtu.be","www.youtu.be"].includes(h)){
  const id=h.endsWith("youtu.be")?u.pathname.split("/")[1]:u.searchParams.get("v")||(u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)||[])[1];
  if(!/^[A-Za-z0-9_-]{11}$/.test(id||""))throw Error("קישור YouTube אינו תקין");
  return {provider:"youtube",provider_asset_id:id,source_url:value};
 }
 if(h==="drive.google.com"){
  const id=(u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)||[])[1];
  if(!/^[A-Za-z0-9_-]{15,}$/.test(id||""))throw Error("יש להזין קישור לקובץ וידאו ב־Google Drive, לא לתיקייה");
  return {provider:"google_drive",provider_asset_id:id,source_url:value};
 }
 throw Error("כרגע ניתן להוסיף סרטוני YouTube או קובצי Google Drive בלבד");
}
function videoGrantCounts(id){
 return {rank:S.rankGrants.filter(x=>x.video_id===id).length,group:S.groupGrants.filter(x=>x.video_id===id).length};
}
function videos(){
 const all=filtered(S.videos,v=>v.title_he+" "+v.category+" "+v.variant+" "+v.provider).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.title_he.localeCompare(b.title_he,"he"));
 const published=S.videos.filter(v=>v.status==="published").length;
 const draft=S.videos.filter(v=>v.status==="draft").length;
 const trs=all.map(v=>{
  const g=videoGrantCounts(v.id);
  return '<tr><td><div class="td-primary"><span class="thumb">'+I("film")+'</span><div><strong>'+H(v.title_he)+'</strong><small>'+H(v.variant||"חומר לימוד")+'</small></div></div></td>'+
   '<td>'+H(categoryLabel(v.category))+'</td>'+
   '<td>'+tag(VIDEO_STATES.find(x=>x[0]===v.status)?.[1]||v.status,v.status==="published"?"allow":"draft")+'</td>'+
   '<td><span class="token">'+I("shield")+' '+g.rank+' חגורות · '+g.group+' קבוצות</span></td>'+
   '<td>'+H(v.provider==="google_drive"?"Google Drive":"YouTube")+'</td>'+
   '<td><div class="button-row"><button class="mini-action" data-item="video" data-id="'+H(v.id)+'">ערוך</button><button class="mini-action" data-action="video-grants" data-id="'+H(v.id)+'">הרשאות</button></div></td></tr>';
 });
 return header("ספריית ההדרכה","פרסום סרטונים והגדרת הרשאות לפי חגורה וקבוצה — ללא מערכת ניהול נוספת",
 button("new-video",I("plus")+" הוסף סרטון","primary"))+
 '<div class="metric-grid" style="margin-bottom:18px">'+metric("סה״כ סרטונים",S.videos.length,"פריטים בקטלוג","film")+
 metric("מפורסמים",published,"לפי הרשאות הגישה","eye","teal")+
 metric("טיוטות",draft,"לא נגישות לחניכים","clock","amber")+
 metric("שיוכי דרגה וקבוצה",S.rankGrants.length+S.groupGrants.length,"כללי גישה פעילים","shield")+'</div>'+
 incomplete("videos")+incomplete("rankGrants")+incomplete("groupGrants")+
 panel("קטלוג סרטונים",searchField("חפש קאטה, סילבוס, סרטון או מקור")+
 (trs.length?table(["סרטון","קטגוריה","מצב","הרשאות","מקור","פעולות"],trs):empty("לא נמצאו סרטונים","נסה לשנות את מילות החיפוש.")))+
 '<div class="alert-bar">'+I("info")+'<span>ההרשאות חלות על הצפייה בתוך האתר. YouTube ו־Google Drive עשויים לאפשר גישה ישירה לקישור ששיתף גורם אחר.</span></div>';
}
function payments(){
 if(S.fail.identity){
  return header("כספים וחיובים","בדיקת הרשאות ואבטחת גישה")+
   message("לא ניתן לוודא הרשאות כספיות כעת: "+S.fail.identity);
 }
 if(!S.identity.finance_access){
 return header("כספים וחיובים","הפרדה מאובטחת בין ניהול כללי לבין מידע פיננסי")+
 '<div class="panel" style="max-width:760px">'+I("lock")+'<h2 style="margin:12px 0">נדרש אימות דו־שלבי (MFA)</h2>'+
 '<p class="muted">המערכת הפיננסית הקיימת מחייבת התחברות ברמת AAL2. לא עקפתי את ההגנה הזאת. לאחר הפעלת אימות מתאים בחשבון המנהל, נתוני החיוב יוצגו כאן.</p>'+
 '<a class="btn secondary" target="_blank" rel="noopener noreferrer" href="https://raphysitruk-eng.github.io/ryoku-do-team-payments/admin.html">'+I("external")+' למערכת התשלומים הקיימת</a></div>';
 }
 if(S.fail.finance)return header("כספים וחיובים","דו״ח מבוסס הרשאות MFA")+
  message("לא ניתן לטעון את הדוח הפיננסי: "+S.fail.finance);
 if(!S.finance)return header("כספים וחיובים","דו״ח מבוסס הרשאות MFA")+'<div class="loading-canvas">טוען נתונים מוגנים…</div>';
 const m=S.finance.mandates||{},charges=asArr(S.finance.charges),alerts=asArr(S.finance.alerts);
 const totals='<div class="metric-grid">'+metric("הוראות קבע פעילות",m.active??0,"לפי מערכת חיובים","check","teal")+
 metric("חיובים ממתינים",m.pending??0,"דורשים מעקב","clock","amber")+
 metric("חיוב חודשי צפוי",Math.round((m.expected_monthly_agorot||0)/100).toLocaleString("he-IL")+" ₪","מבוסס הוראות קבע","grid")+
 metric("התראות כספיות",alerts.length,"התראות פתוחות","shield","rose")+'</div>';
 const trs=charges.slice(0,100).map(c=>'<tr><td>'+H(c.charge_date||"")+'</td><td>'+H(c.outcome||"")+'</td><td>'+H(c.actual_amount_agorot==null?"—":Math.round(c.actual_amount_agorot/100)+" ₪")+'</td><td>'+H(c.document_outcome||"—")+'</td></tr>');
 return header("כספים וחיובים","תצוגת בקרה בלבד; פעולות סליקה מתבצעות דרך השירות המאושר")+
 totals+'<div style="margin-top:18px">'+panel("תנועות דיווח אחרונות",trs.length?table(["תאריך","תוצאה","סכום","מסמך"],trs):empty("אין תנועות להצגה",""))+'</div>';
}
async function loadFinance(){try{S.finance=await command("finance_report");delete S.fail.finance}catch(e){S.fail.finance=String(e.message||e)}render()}
async function loadContent(){
 const jobs=[["event","event"],["product","product"],["resource","resource"]];
 const result=await Promise.allSettled(jobs.map(x=>listed(x[1])));
 result.forEach((r,i)=>{if(r.status==="fulfilled")S.sets[jobs[i][0]]=r.value;else S.fail[jobs[i][0]]=String(r.reason?.message||r.reason)});
 render();
}
function content(){
 let sections=["event","product","resource"].map(kind=>{
  const a=rows(kind),list=filtered(a,x=>x.title+" "+x.status+" "+x.branch);
  const trs=list.map(x=>'<tr><td><strong>'+H(x.title||"—")+'</strong></td><td>'+H(x.branch||"—")+'</td><td>'+tag(x.status)+'</td><td>'+H(formatDate(x.updated_at))+'</td></tr>');
  return panel({event:"אירועים ותחרויות",product:"ציוד ומוצרים",resource:"קבצי הדרכה ומסמכים"}[kind],incomplete(kind)+(trs.length?table(["פריט","סניף","מצב","עודכן"],trs):empty("אין פריטים מוצגים","אפשר להמשיך לעבוד במערכת המקור עד חיבור כל פעולות העריכה.")));
 });
 return header("תוכן, ציוד ואירועים","ניהול מידע ארגוני קיים; חיבור פעולות עריכה מתקדמות נמצא בהמשך")+
 '<div class="report-grid">'+sections.join("")+'</div>';
}
function integrations(){
 const health=S.integrationHealth;
 const whatsapp=health?.whatsapp;
 const liveWa=whatsapp?.send_ready===true;
 const waMode=whatsapp?.mode==="demo"?"שרת פעיל במצב הדגמה":liveWa?"שליחה זמינה":"שליחה לא מאומתת";
 const modules=[
 {title:"אתר האקדמיה",name:"ryokudoacademy.com",status:health?.website?.online?"אתר זמין":"זמינות לא אומתה",note:"בדיקת זמינות חיה. עריכת האתר עדיין דורשת חיבור למקור האתר המארח; ניהול הממשק הקיים נעשה בנפרד.",url:"https://www.ryokudoacademy.com/management.html"},
 {title:"Supabase",name:"נתונים, משתמשים והרשאות",status:"מחובר",note:"ממשקי החניכים, הקבוצות, המשימות והוידאו משתמשים במידע כאן.",url:"https://supabase.com/dashboard/project/zwgpvwxdofjidshsiaek"},
 {title:"Digital Dojo",name:"ספריית הדרכה",status:health?.control_center?.online?"מחובר":"לבדיקת זמינות",note:"ניהול הסרטונים וההרשאות פועל בתוך מרכז הניהול המאוחד.",url:"./control.html?view=videos"},
 {title:"תשלומי הנבחרת",name:"תזמן / Invoice4U",status:"חיבור חלקי",note:"סיכומי החיוב זמינים ב־MFA; פעולות תשלום מחייבות עבודה דרך מערכת התשלומים הייעודית.",url:"https://raphysitruk-eng.github.io/ryoku-do-team-payments/admin.html"},
 {title:"תזכורות WhatsApp",name:"Railway + Supabase",status:waMode,note:"בדיקת שרת מאובטחת בזמן אמת. מצב ההדגמה אינו מאפשר להסיק שהודעות נשלחות בפועל; יש לאשר חיבור קבוצות ושליחה בייצור בנפרד.",url:"https://ryokudo-reminder-server-production.up.railway.app/"},
 {title:"GitHub",name:"קוד ושינויים",status:"פרסום פעיל",note:"פריסת GitHub Pages מתבצעת באופן אוטומטי לאחר שינוי קוד מאושר.",url:"https://github.com/raphysitruk-eng/ryoku-do-team-payments"},
 {title:"הגנת סיסמאות",name:"Supabase Auth",status:"דורש הפעלה",note:"הגנת Leaked Password Protection נמצאה כבויה. יש להפעיל אותה בהגדרות Supabase Auth; הדבר אינו ניתן לשינוי דרך הרשאות החיבור הנוכחיות.",url:"https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection"}
 ];
 return header("חיבורים ותשתיות","בדיקות זמינות חיות לצד סטטוס חיבור השירותים וההרשאות")+
 incomplete("integrationHealth")+
 (health?.checked_at?'<p class="muted-note">נבדק לאחרונה: '+H(formatTime(health.checked_at))+'</p>':"")+
 '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:14px">'+modules.map(m=>
 '<div class="panel"><div class="panel-head"><h2>'+H(m.title)+'</h2>'+tag(m.status,m.status==="מחובר"?"allow":m.status==="שליחה לא מחוברת"?"blocked":"draft")+'</div>'+
 '<div class="muted" style="font-size:12px">'+H(m.name)+'</div><p style="font-size:13px;line-height:1.8;margin:15px 0">'+H(m.note)+'</p>'+
 '<a class="btn secondary" target="_blank" rel="noopener noreferrer" href="'+H(m.url)+'">'+I("external")+' מעבר לשירות</a></div>').join("")+'</div>'+
 message("איחוד חזותי ואיחוד כניסת מנהל למודולים מבוססי Supabase אינם שקולים עדיין לאיחוד מלא של ממשקי ה־API של Wix, WhatsApp וספקי הסליקה. הם ימשיכו לפעול במערכותיהם עד להשלמת החיבור.");
}

function access(){
 const members=filtered(S.profiles,p=>[p.full_name,p.email,p.phone,p.role,p.approval_status].join(" ").toLowerCase());
 const blocked=new Set(S.blocks.filter(x=>x.blocked).map(x=>x.profile_id));
 const list=members.map(p=>{
  const count=rows("students").filter(x=>x.parent_id===p.id).length;
  return '<tr><td><strong>'+H(p.full_name||p.email||"ללא שם")+'</strong><small style="display:block" class="muted">'+H(p.email||"")+'</small></td>'+
   '<td>'+H(p.role||"—")+'</td><td>'+H(p.approval_status||"—")+'</td>'+
   '<td>'+count+'</td><td>'+tag(blocked.has(p.id)?"חסום בספרייה":"ללא חסימה",blocked.has(p.id)?"blocked":"allow")+'</td>'+
   '<td><button type="button" class="mini-action" data-item="profile" data-id="'+H(p.id)+'">נהל גישה</button></td></tr>';
 });
 return header("משתמשים והרשאות","ניהול חשבונות, חריגות גישה וחסימות ספריית ההדרכה")+
 incomplete("profiles")+incomplete("blocks")+incomplete("profileGrants")+
 panel("משתמשים מורשים וחשבונות",searchField("שם, דוא״ל, טלפון או הרשאה")+
 (list.length?table(["חשבון","תפקיד","אישור","חניכים","ספרייה","ניהול"],list):empty("אין משתמשים מתאימים","")));
}
function auditPage(){
 const a=filtered(S.audit,x=>[x.action,x.table_name,x.actor,x.changed_at].join(" "));
 const trs=a.map(x=>'<tr><td>'+H(formatTime(x.changed_at))+'</td><td>'+H(({INSERT:"יצירה",UPDATE:"עדכון",DELETE:"מחיקה"})[x.action]||x.action)+'</td>'+
 '<td>'+H(x.table_name||"—")+'</td><td>'+H(S.profiles.find(p=>p.id===x.actor)?.full_name||"מנהל")+'</td></tr>');
 return header("יומן פעילות","150 אירועי שינוי אחרונים בספריית ההדרכה וההרשאות")+
 incomplete("audit")+panel("שינויים מתועדים",searchField("סוג פעולה, טבלה או משתמש")+
 (trs.length?table(["תאריך","פעולה","רכיב","בוצע על ידי"],trs):empty("אין אירועים להצגה","")));
}
function profileEditor(p){
 const kids=rows("students").filter(c=>c.parent_id===p.id);
 const current=S.blocks.some(b=>b.profile_id===p.id&&b.blocked);
 const overrides=S.profileGrants.filter(x=>x.profile_id===p.id).map(x=>({who:"החשבון",id:p.id,type:"profile",...x})).concat(S.childGrants.filter(x=>kids.some(c=>c.id===x.child_id)).map(x=>({who:nameChild(kids.find(c=>c.id===x.child_id)||{}),id:x.child_id,type:"child",...x})));
 const list=overrides.length?overrides.map(x=>'<div class="subrow"><div><strong>'+H(S.videos.find(v=>v.id===x.video_id)?.title_he||"סרטון")+'</strong><small class="muted" style="display:block">'+H(x.who)+" · "+H(x.decision==="allow"?"גישה":"חסימה")+(x.expires_at?" · עד "+H(formatDate(x.expires_at)):"")+'</small></div>'+
 '<button type="button" class="mini-action" data-action="delete-personal-override" data-scope="'+H(x.type)+'" data-id="'+H(x.id)+'" data-video="'+H(x.video_id)+'">הסר</button></div>').join(""):empty("אין החרגות אישיות","");
 const self=p.id===S.user.id;
 const scopeOptions=[["profile:"+p.id,"כל החשבון"]].concat(kids.map(c=>["child:"+c.id,nameChild(c)]));
 const form='<form id="personalGrantForm" class="form-stack">'+
 '<div class="field"><label>סרטון</label><select name="video_id" required>'+S.videos.map(v=>opt(v.id,v.title_he,"")).join("")+'</select></div>'+
 '<div class="field"><label>חשבון או חניך</label><select name="scope">'+scopeOptions.map(x=>opt(x[0],x[1],"")).join("")+'</select></div>'+
 '<div class="field-row"><div class="field"><label>הרשאה</label><select name="decision">'+[["allow","אפשר צפייה"],["deny","מנע צפייה"],["clear","נקה החרגה"]].map(x=>opt(x[0],x[1],"allow")).join("")+'</select></div>'+
 '<div class="field"><label>עד מועד (אופציונלי)</label><input type="datetime-local" name="expires_at"></div></div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' שמור חריגה</button></form>';
 showDrawer(p.full_name||p.email||"פרטי משתמש",
 '<div class="drawer-section"><strong>'+H(p.full_name||"")+'</strong><p class="muted-note">'+H(p.email||"")+' · '+H(p.role||"")+'</p>'+
 tag(current?"גישה לספרייה חסומה":"גישה אינה חסומה",current?"blocked":"allow")+'</div>'+
 '<h3 class="section-label">גישה פרטנית לסרטונים</h3>'+form+
 '<div class="drawer-section"><h3>הרשאות קיימות</h3>'+list+'</div>'+
 '<div class="danger-zone"><strong>חסימת גישה לספרייה כולה</strong><p class="muted-note">חסימה אינה מוחקת משתמשים ואינה משפיעה על תשלומים.</p>'+
 '<button type="button" class="btn '+(current?"secondary":"danger")+'" data-action="toggle-profile-block" data-id="'+H(p.id)+'" '+(self?"disabled":"")+'>'+
 (current?"בטל חסימת ספרייה":"חסום ספרייה לחשבון")+'</button></div>'+
 (self?message("לא ניתן לחסום את חשבון המנהל המחובר."):""),p.id,"profile");
}
async function applyPersonalGrant(form){
 const p=S.profiles.find(x=>x.id===S.drawer?.id);if(!p)throw Error("חשבון לא נמצא");
 const f=new FormData(form),scope=String(f.get("scope")||""),video_id=String(f.get("video_id")||""),decision=String(f.get("decision")||"");
 const match=scope.match(/^(profile|child):([a-f0-9-]{36})$/i);
 if(!match||!S.videos.some(x=>x.id===video_id))throw Error("סרטון או חשבון אינם תקינים");
 const kind=match[1],id=match[2],table=kind==="child"?"training_video_child_grants":"training_video_profile_grants",key=kind==="child"?"child_id":"profile_id";
 if(kind==="profile"&&id!==p.id)throw Error("חשבון אינו תואם");
 if(kind==="child"&&!rows("students").some(x=>x.id===id&&x.parent_id===p.id))throw Error("החניך אינו משויך לחשבון");
 if(decision==="clear"){requireData(await sb.from(table).delete().eq("video_id",video_id).eq(key,id))}
 else{
  if(!["allow","deny"].includes(decision))throw Error("סוג הרשאה אינו תקין");
  const raw=String(f.get("expires_at")||"").trim(),dt=raw?new Date(raw):null;
  if(dt&&(!Number.isFinite(dt.getTime())||dt.getTime()<=Date.now()))throw Error("תאריך התפוגה חייב להיות בעתיד");
  requireData(await sb.from(table).upsert({video_id,[key]:id,decision,expires_at:dt?dt.toISOString():null,
   changed_by:S.user.id,updated_at:new Date().toISOString()},{onConflict:"video_id,"+key}));
 }
 await refresh();profileEditor(p);toast("ההרשאה האישית עודכנה");
}
async function toggleBlock(id){
 if(id===S.user.id)throw Error("לא ניתן לחסום את חשבון המנהל");
 if(!S.profiles.some(x=>x.id===id))throw Error("לא נמצא חשבון");
 const current=S.blocks.some(x=>x.profile_id===id&&x.blocked);
 if(!window.confirm(current?"לבטל את החסימה של חשבון זה?":"לחסום חשבון זה מגישה לספריית הסרטונים?"))return;
 requireData(await sb.from("training_library_blocks").upsert({profile_id:id,blocked:!current,
 changed_by:S.user.id,updated_at:new Date().toISOString()},{onConflict:"profile_id"}));
 await refresh();const p=S.profiles.find(x=>x.id===id);if(p)profileEditor(p);
 toast(current?"חסימת הספרייה בוטלה":"הגישה לספרייה נחסמה");
}
async function deleteOverride(type,id,video){
 if(!["profile","child"].includes(type))throw Error("סוג הרשאה אינו מוכר");
 const p=S.profiles.find(x=>x.id===S.drawer?.id);if(!p)throw Error("חשבון לא נמצא");
 if(type==="profile"&&id!==p.id)throw Error("חשבון לא תואם");
 if(type==="child"&&!rows("students").some(x=>x.parent_id===p.id&&x.id===id))throw Error("חניך לא תואם");
 if(!window.confirm("להסיר את ההרשאה האישית לסרטון?"))return;
 const table=type==="child"?"training_video_child_grants":"training_video_profile_grants",key=type==="child"?"child_id":"profile_id";
 requireData(await sb.from(table).delete().eq(key,id).eq("video_id",video));
 await refresh();profileEditor(p);toast("החריגה הוסרה");
}

function showDrawer(title,body,id,kind){
 S.lastFocus=document.activeElement;S.dirty=false;
 S.drawer={id:id||null,kind:kind};
 $("drawerEyebrow").textContent="RYOKU-DO CONTROL CENTER";
 $("drawerTitle").textContent=title;
 $("drawerBody").innerHTML=body;
 $("drawer").classList.remove("hide");$("drawerShade").classList.remove("hide");
 document.body.style.overflow="hidden";$("drawerClose").focus();
}
function hideDrawer(force=false){
 if(S.drawer&&S.dirty&&!force&&!window.confirm("יש שינויים שלא נשמרו. לצאת מהחלונית ולבטל אותם?"))return false;
 $("drawer").classList.add("hide");$("drawerShade").classList.add("hide");
 document.body.style.overflow="";S.drawer=null;S.dirty=false;
 try{if(S.lastFocus?.isConnected)S.lastFocus.focus()}catch(_){}
 return true;
}
function chooseItem(kind,id){
 let a=kind==="video"?S.videos:kind==="profile"?S.profiles:rows(kind),x=a.find(t=>t.id===id);
 if(!x)return toast("לא ניתן למצוא את הפריט",true);
 if(kind==="task"||kind==="lead"){editorItem(kind,x);return}
 if(kind==="video"){videoEditor(x);return}
 if(kind==="profile"){profileEditor(x);return}
 if(kind==="student"){studentEditor(x);return}
 if(kind==="group"){groupEditor(x);return}
 if(kind==="session"){attendanceEditor(x);return}

}

function studentEditor(x){
 const assigned=rows("memberships").filter(m=>m.child_id===x.id&&m.status==="active").map(m=>nameGroup(m.group_id));
 const form='<form class="form-stack" id="studentForm">'+
 '<div class="field-row"><div class="field"><label for="firstName">שם פרטי</label><input id="firstName" name="first_name" maxlength="80" required value="'+H(x.first_name||"")+'"></div>'+
 '<div class="field"><label for="lastName">שם משפחה</label><input id="lastName" name="last_name" maxlength="80" value="'+H(x.last_name||"")+'"></div></div>'+
 '<div class="field-row"><div class="field"><label for="studentBranch">סניף</label><input id="studentBranch" name="branch" maxlength="100" value="'+H(x.branch||"")+'"></div>'+
 '<div class="field"><label for="studentGroup">שם קבוצה ברשומה</label><input id="studentGroup" name="group_name" maxlength="100" value="'+H(x.group_name||"")+'"></div></div>'+
 '<div class="field"><label for="contactPhone">טלפון קשר</label><input id="contactPhone" name="contact_phone" type="tel" maxlength="30" value="'+H(x.contact_phone||"")+'"></div>'+
 '<div class="field"><label for="contactEmail">דוא״ל קשר</label><input id="contactEmail" name="contact_email" type="email" maxlength="254" value="'+H(x.contact_email||"")+'"></div>'+
 '<label class="check-choice"><input type="checkbox" name="active" '+(x.active?"checked":"")+'> חניך פעיל</label>'+
 '<div class="warning-box">דרגה נוכחית: '+H(x.current_rank||"לא הוגדרה")+'. שיוך רשמי לחוגים: '+H(assigned.join(", ")||"אין שיוך פעיל")+'. עדכון שם הקבוצה ברשומה אינו מחליף חברות רשמית או חיוב חודשי.</div>'+
 '<button class="btn primary full" type="submit">'+I("check")+' שמור פרטי חניך</button></form>';
 showDrawer(nameChild(x),form,x.id,"student");
}
async function saveStudent(form){
 const x=rows("students").find(z=>z.id===S.drawer?.id);if(!x)throw Error("רשומת החניך אינה זמינה");
 const f=new FormData(form),first=String(f.get("first_name")||"").trim(),last=String(f.get("last_name")||"").trim();
 if(!first||first.length>80||last.length>80)throw Error("בדוק את שם החניך");
 const payload={child_id:x.id,first_name:first,last_name:last,branch:String(f.get("branch")||"").trim(),
 group_name:String(f.get("group_name")||"").trim(),contact_phone:String(f.get("contact_phone")||"").trim(),
 contact_email:String(f.get("contact_email")||"").trim(),active:f.has("active")};
 await command("student_update",payload,crypto.randomUUID());
 S.sets.students=await listed("students");hideDrawer(true);render();toast("פרטי החניך עודכנו");
}
function groupEditor(g){
 const count=rows("memberships").filter(m=>m.group_id===g.id&&m.status==="active").length;
 const f='<form class="form-stack" id="groupForm">'+
 '<div class="field"><label>שם קבוצה</label><input name="name" maxlength="100" required value="'+H(g.name)+'"></div>'+
 '<div class="field"><label>סניף</label><input readonly value="'+H(g.branch)+'"><p class="muted-note">מעבר קבוצה לסניף אחר דורש טיפול נפרד בשיוכי החניכים.</p></div>'+
 '<div class="field"><label>קיבולת מרבית</label><input name="capacity" type="number" min="1" max="1000" value="'+H(g.capacity??"")+'" placeholder="ללא הגבלה"></div>'+
 '<label class="check-choice"><input type="checkbox" name="active" '+(g.active?"checked":"")+'> קבוצה פעילה</label>'+
 '<div class="warning-box">מספר שיוכים פעילים: '+count+'. שינוי הקיבולת אינו משנה את חיובי החניכים. לוח האימונים הקיים יישמר.</div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' שמור קבוצה</button></form>';
 showDrawer(g.name,f,g.id,"group");
}
async function saveGroup(form){
 const g=rows("groups").find(z=>z.id===S.drawer?.id);if(!g)throw Error("לא נמצאה קבוצה");
 const f=new FormData(form),name=String(f.get("name")||"").trim(),cap=String(f.get("capacity")||"").trim();
 if(name.length<1||name.length>100)throw Error("שם הקבוצה אינו תקין");
 if(cap&&(!Number.isInteger(Number(cap))||Number(cap)<1||Number(cap)>1000))throw Error("קיבולת חייבת להיות בין 1 ל־1000");
 await command("group_save",{id:g.id,rev:g.rev,code:g.code,name,branch:g.branch,
 schedule:g.schedule||[],capacity:cap||null,active:f.has("active")},crypto.randomUUID());
 S.sets.groups=await listed("groups");hideDrawer(true);render();toast("פרטי הקבוצה נשמרו");
}
async function attendanceEditor(session){
 if(S.fail.memberships||S.fail.students){toast("רשימות החניכים או השיוכים אינן זמינות. רענן את המערכת.",true);return}
 const group=rows("groups").find(x=>x.id===session.group_id);
 const eligible=rows("memberships").filter(m=>m.group_id===session.group_id&&m.status==="active"&&
 (!m.starts_on||session.training_date>=m.starts_on)&&(!m.ends_on||session.training_date<=m.ends_on))
 .map(m=>rows("students").find(x=>x.id===m.child_id)).filter(x=>x&&x.active);
 showDrawer((group?.name||"קבוצה")+" · "+session.training_date,
 '<div class="loading-canvas"><div class="spinner"></div>טוען רישומי נוכחות…</div>',session.id,"session");
 try{
  const response=await command("list",{kind:"attendance",session_id:session.id});
  if(S.drawer?.id!==session.id)return;
  const saved=new Map(asArr(response.items).map(m=>[m.child_id,m]));
  S.attendance={id:session.id,marks:saved,eligible:eligible.map(x=>x.id)};
  const today=localDateTime(new Date()).slice(0,10);
  const locked=session.status==="completed"||session.status==="cancelled"||session.training_date>today;
  const trs=eligible.map(x=>{
   const mark=saved.get(x.id)||{};
   return '<div class="attendance-person"><strong>'+H(nameChild(x))+'</strong><select name="mark_'+H(x.id)+'" aria-label="נוכחות '+H(nameChild(x))+'" '+(locked?"disabled":"")+'>'+
    [["","טרם סומן"],["present","נכח"],["absent","נעדר"],["excused","היעדרות מוצדקת"]].map(o=>opt(o[0],o[1],mark.status||"")).join("")+'</select></div>';
  });
  $("drawerBody").innerHTML='<form class="form-stack" id="attendanceForm"><p class="muted-note">'+H(session.training_date)+' · '+H((session.starts_at||"").slice(0,5))+'–'+H((session.ends_at||"").slice(0,5))+'</p>'+
   (eligible.length?trs.join(""):empty("אין חניכים משויכים","יש לבדוק את רישומי השיוך לקבוצה"))+
   (locked?message("מפגש שהושלם, בוטל או נמצא בעתיד: הצפייה בלבד."):
    '<button class="btn secondary full" type="submit">שמור סימוני נוכחות</button>'+
    '<button class="btn primary full" type="button" data-action="finalize-attendance">שמור וסיים אימון</button>')+'</form>';
 }catch(err){if(S.drawer?.id===session.id)$("drawerBody").innerHTML=message("שגיאה בטעינת נוכחות: "+(err.message||""))}
}
async function saveAttendance(form,finalize){
 const session=rows("sessions").find(x=>x.id===S.drawer?.id),snapshot=S.attendance;
 if(!session||!snapshot||snapshot.id!==session.id)throw Error("נתוני האימון אינם זמינים");
 const today=localDateTime(new Date()).slice(0,10);
 if(session.status==="completed"||session.status==="cancelled"||session.training_date>today)throw Error("לא ניתן לעדכן אימון נעול או עתידי");
 if(!snapshot.eligible.length)throw Error("אין חניכים זכאים לסימון");
 const f=new FormData(form),marks=snapshot.eligible.map(child_id=>{
  const status=String(f.get("mark_"+child_id)||"");
  if(!["present","absent","excused"].includes(status))throw Error("יש לסמן נוכחות לכל החניכים");
  return {child_id,status,note:snapshot.marks.get(child_id)?.note||""};
 });
 await command("attendance_save",{session_id:session.id,rev:session.rev,marks,finalize:!!finalize},crypto.randomUUID());
 S.sets.sessions=await listed("sessions");hideDrawer(true);render();toast(finalize?"האימון הושלם והנוכחות נשמרה":"סימוני הנוכחות נשמרו");
}

function editorItem(kind,x){
 const isLead=kind==="lead",options=isLead?leadStages:taskStages;
 const data=x?.data||{},selected=x?.status||(isLead?"new":"open");
 const body='<form id="itemForm" class="form-stack">'+
 '<div class="field"><label>כותרת *</label><input name="title" maxlength="180" value="'+H(x?.title||"")+'" required></div>'+
 '<div class="field-row"><div class="field"><label>מצב</label><select name="status">'+options.map(z=>opt(z[0],z[1],selected)).join("")+'</select></div>'+
 '<div class="field"><label>סניף</label><input name="branch" value="'+H(x?.branch||"")+'" maxlength="80"></div></div>'+
 (isLead?'<div class="field"><label>סיבת סגירה, אם סוגרים פנייה</label><input name="loss_reason" value="'+H(data.loss_reason||"")+'"></div>'+
 '<div class="field"><label>אסמכתת רישום, אם מסמנים נרשם</label><input name="enrollment_reference" value="'+H(data.enrollment_reference||"")+'"></div>':
 '<div class="field"><label>תאריך יעד</label><input type="datetime-local" name="due_at" value="'+H(x?.due_at?localDateTime(x.due_at):"")+'"></div>')+
 '<p class="muted-note">הנתונים הקיימים נשמרים. השינוי עובר דרך מנגנון הבקרה והיומן של האקדמיה.</p>'+
 '<button type="submit" class="btn primary full">'+I("check")+' שמור שינויים</button></form>';
 showDrawer(x?.title||(isLead?"פנייה חדשה":"משימה חדשה"),body,x?.id||null,kind);
}
function videoEditor(v){
 const data=v||{title_he:"",description_he:"",status:"draft",category:"kata",source_url:"",variant:""};
 const form='<form id="videoForm" class="form-stack">'+
 '<div class="field"><label>כותרת הסרטון *</label><input name="title" maxlength="180" value="'+H(data.title_he)+'" required></div>'+
 '<div class="field"><label>קישור YouTube או Google Drive *</label><input name="source_url" type="url" value="'+H(data.source_url)+'" required><span class="input-note">ניתן לצרף סרטון יחיד; לא קישור לתיקייה.</span></div>'+
 '<div class="field-row"><div class="field"><label>קטגוריה</label><select name="category">'+VIDEO_CATEGORIES.map(x=>opt(x[0],x[1],data.category)).join("")+'</select></div>'+
 '<div class="field"><label>מצב פרסום</label><select name="status">'+VIDEO_STATES.map(x=>opt(x[0],x[1],data.status)).join("")+'</select></div></div>'+
 '<div class="field"><label>תת־כותרת</label><input name="variant" maxlength="100" value="'+H(data.variant)+'" placeholder="לדוגמה: הדגמה איטית"></div>'+
 '<div class="field"><label>תיאור</label><textarea name="description" maxlength="1200">'+H(data.description_he)+'</textarea></div>'+
 '<div class="warning-box">סרטון חדש אינו נגיש לחניכים עד לפרסום ולהגדרת הרשאות גישה. קישור פומבי למקור עצמו אינו מוגן.</div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' '+(v?"שמור סרטון":"צור סרטון")+'</button></form>';
 showDrawer(v?.title_he||"הוספת סרטון",form,v?.id||null,"video");
}
function videoPermissionEditor(v){
 if(!v)return toast("הסרטון אינו נמצא",true);
 if(S.fail.rankGrants||S.fail.groupGrants||S.fail.groups)return toast("נתוני ההרשאות לא נטענו. נסה לרענן לפני עריכה.",true);
 const grantedRanks=S.rankGrants.filter(x=>x.video_id===v.id).map(x=>x.rank_key);
 const grantedGroups=S.groupGrants.filter(x=>x.video_id===v.id).map(x=>x.group_id);
 const ranks=RANKS.map(x=>'<label class="check-choice"><input type="checkbox" name="rank" value="'+H(x[0])+'"'+(grantedRanks.includes(x[0])?" checked":"")+'>'+H(x[1])+'</label>').join("");
 const groups=rows("groups").filter(g=>g.active).map(g=>'<label class="check-choice"><input type="checkbox" name="group" value="'+H(g.id)+'"'+(grantedGroups.includes(g.id)?" checked":"")+'><span>'+H(g.name)+'<small style="display:block;color:#91a0ad">'+H(g.branch||"")+'</small></span></label>').join("");
 const body='<div class="drawer-section"><strong>'+H(v.title_he)+'</strong><div style="margin-top:9px">'+tag(v.status==="published"?"מפורסם":"טיוטה",v.status==="published"?"allow":"draft")+'</div></div>'+
 '<form id="videoGrantsForm" class="form-stack"><h3 class="section-label">הרשאות לפי חגורה</h3><div class="check-grid">'+ranks+'</div>'+
 '<h3 class="section-label">הרשאות לפי קבוצת אימון</h3><div class="check-grid">'+(groups||'<p class="muted">אין קבוצות פעילות</p>')+'</div>'+
 '<div class="warning-box">חסימות והרשאות אישיות גוברות על הגדרות הדרגה. הגדרות חשבון וחניך ניתן לנהל במערכת החניכים המורחבת.</div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' שמור הרשאות</button></form>';
 showDrawer("הרשאות צפייה",body,v.id,"video-grants");
}
async function saveVideoGrants(form){
 if(S.fail.rankGrants||S.fail.groupGrants||S.fail.groups)throw Error("לא ניתן לשמור הרשאות כאשר הנתונים לא נטענו");
 const id=S.drawer?.id;if(!S.videos.some(v=>v.id===id))throw Error("לא נמצא סרטון");
 const f=new FormData(form);
 const ranks=[...new Set(f.getAll("rank").map(String))];
 const groups=[...new Set(f.getAll("group").map(String))];
 const result=requireData(await sb.rpc("training_video_set_grants",{p_video_id:id,p_ranks:ranks,p_groups:groups}));
 await refresh();hideDrawer(true);toast("כל הרשאות הסרטון נשמרו בעסקה אחת");
 return result;
}

async function saveItem(form){
 let kind=S.drawer?.kind||"task",old=rows(kind).find(z=>z.id===S.drawer?.id),f=new FormData(form);
 let title=String(f.get("title")||"").trim(),status=String(f.get("status")||""),branch=String(f.get("branch")||"").trim();
 if(title.length<2)throw Error("חובה להזין כותרת");
 if(kind==="lead"&&!leadStages.some(x=>x[0]===status))throw Error("סטטוס פנייה אינו מוכר");
 if(kind==="task"&&!taskStages.some(x=>x[0]===status))throw Error("סטטוס משימה אינו מוכר");
 let data={...(old?.data||{})};
 if(kind==="lead"){
  let reason=String(f.get("loss_reason")||"").trim(),enroll=String(f.get("enrollment_reference")||"").trim();
  if(reason)data.loss_reason=reason;
  if(enroll)data.enrollment_reference=enroll;
  if(status==="closed"&&!data.loss_reason)throw Error("יש למלא סיבת סגירה");
  if(status==="registered"&&!old?.child_id&&!data.enrollment_reference)throw Error("לסטטוס נרשם נדרשת אסמכתת רישום");
 }
 let due=null;
 if(kind==="task"&&f.get("due_at")){
  const date=new Date(String(f.get("due_at")));
  if(isNaN(date.getTime()))throw Error("תאריך יעד אינו תקין");
  due=date.toISOString();
 }
 const payload={kind,id:old?.id||null,rev:old?.rev,title,status,branch,child_id:old?.child_id||null,group_id:old?.group_id||null,related_id:old?.related_id||null,owner_id:old?.owner_id||null,due_at:kind==="task"?due:(old?.due_at||null),data};
 await command("item_save",payload,crypto.randomUUID());
 S.sets[kind==='lead'?'leads':'tasks']=await listed(kind);
 hideDrawer(true);render();toast("השינויים נשמרו בהצלחה");
}
async function saveVideo(form){
 const old=S.videos.find(v=>v.id===S.drawer?.id);
 const f=new FormData(form),title=String(f.get("title")||"").trim(),status=String(f.get("status")||"");
 const category=String(f.get("category")||"");
 if(title.length<2||!VIDEO_STATES.some(x=>x[0]===status)||!VIDEO_CATEGORIES.some(x=>x[0]===category))throw Error("נתוני סרטון לא תקינים");
 const source=parseVideoSource(String(f.get("source_url")||"").trim());
 const data={title_he:title,status,category,...source,description_he:String(f.get("description")||"").trim(),variant:String(f.get("variant")||"").trim(),updated_at:new Date().toISOString()};
 if(old){
  requireData(await sb.from("training_videos").update(data).eq("id",old.id).select("id").single());
 }else{
  data.slug="video-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
  requireData(await sb.from("training_videos").insert(data).select("id").single());
 }
 await refresh();hideDrawer(true);toast(old?"פרטי הסרטון נשמרו":"הסרטון נוסף לספרייה");
}
async function saveForm(form){
 if(S.busy)return;
 S.busy=true;let buttonNode=form.querySelector('button[type="submit"]');
 if(buttonNode)buttonNode.disabled=true;
 try{if(form.id==="itemForm")await saveItem(form);else if(form.id==="videoForm")await saveVideo(form);else if(form.id==="videoGrantsForm")await saveVideoGrants(form);else if(form.id==="studentForm")await saveStudent(form);else if(form.id==="groupForm")await saveGroup(form);else if(form.id==="attendanceForm")await saveAttendance(form,false);else if(form.id==="personalGrantForm")await applyPersonalGrant(form)}
 catch(err){toast(err.message||"שמירה נכשלה",true)}
 finally{S.busy=false;if(buttonNode)buttonNode.disabled=false}
}

const GLOBAL_PAGES=[
 ["overview","לוח בקרה","grid"],["students","חניכים והורים","users"],["roster","קליטת רשימות","book"],
 ["groups","סניפים וקבוצות","book"],["sessions","אימונים ונוכחות","check"],
 ["leads","פניות והרשמות","search"],["tasks","משימות ומעקב","clock"],
 ["videos","ספריית הדרכה","film"],["payments","כספים וחיובים","shield"],
 ["content","תוכן, ציוד ואירועים","settings"],["access","משתמשים והרשאות","shield"],["audit","יומן פעילות","clock"],["integrations","חיבורים ותשתיות","external"]
];
function globalMatches(query){
 const term=String(query||"").trim().toLocaleLowerCase("he-IL");
 const pages=GLOBAL_PAGES.filter(x=>!term||x[1].toLocaleLowerCase("he-IL").includes(term)).map(x=>({label:x[1],meta:"מסך ניהול",icon:x[2],view:x[0]}));
 if(!term)return pages;
 const matches=[];
 [
 ["student",rows("students"),x=>nameChild(x)+" "+x.branch+" "+x.group_name,"חניך","users"],
 ["lead",rows("leads"),x=>x.title+" "+x.branch,"פנייה","search"],
 ["task",rows("tasks"),x=>x.title+" "+x.branch,"משימה","clock"],
 ["video",S.videos,x=>x.title_he+" "+x.category,"סרטון","film"],
 ["group",rows("groups"),x=>x.name+" "+x.branch,"קבוצה","book"],
 ["profile",S.profiles,x=>x.full_name+" "+x.email,"משתמש","shield"]
 ].forEach(set=>{
  set[1].forEach(item=>{
   if(String(set[2](item)).toLocaleLowerCase("he-IL").includes(term)){
    matches.push({label:set[0]==="student"?nameChild(item):set[0]==="group"?item.name:set[0]==="video"?item.title_he:set[0]==="profile"?(item.full_name||item.email):item.title,meta:set[3],icon:set[4],kind:set[0],id:item.id});
   }
  });
 });
 return pages.concat(matches).slice(0,14);
}
function renderGlobalSearch(){
 const items=globalMatches($("globalSearchInput").value);
 $("globalSearchResults").innerHTML=items.length?items.map((x,i)=>{
  const a=x.view?' data-global-view="'+H(x.view)+'"':' data-global-item="'+H(x.kind)+'" data-id="'+H(x.id)+'"';
  return '<button type="button" class="search-result"'+a+'>'+I(x.icon)+
  '<span><strong style="display:block">'+H(x.label)+'</strong><small class="muted">'+H(x.meta)+'</small></span>'+
  '<span style="margin-right:auto;color:#94a1ad">'+I("chevron")+'</span></button>';
 }).join(""):empty("לא נמצאו תוצאות","נסה מונח אחר");
}
function openGlobalSearch(){
 if(S.profile?.role!=="admin")return;
 const dialog=$("searchDialog");
 $("globalSearchInput").value="";
 renderGlobalSearch();
 if(!dialog.open)dialog.showModal();
 $("globalSearchInput").focus();
}
function closeGlobalSearch(){if($("searchDialog").open)$("searchDialog").close()}
document.addEventListener("click",async e=>{
 const globalView=e.target.closest("[data-global-view]");
 if(globalView){closeGlobalSearch();navigate(globalView.dataset.globalView);return}
 const globalItem=e.target.closest("[data-global-item]");
 if(globalItem){closeGlobalSearch();chooseItem(globalItem.dataset.globalItem,globalItem.dataset.id);return}
 const pager=e.target.closest("[data-page]");
 if(pager){S.page=Math.max(0,Number(pager.dataset.page)||0);render();return}
 const nav=e.target.closest("[data-view]");if(nav){navigate(nav.dataset.view);return}
 const card=e.target.closest("[data-go]");if(card){navigate(card.dataset.go);return}
 const target=e.target.closest("[data-item]");if(target){chooseItem(target.dataset.item,target.dataset.id);return}
 const action=e.target.closest("[data-action]");if(!action)return;
 const act=action.dataset.action;
 if(act==="refresh"){await refresh();toast("הנתונים עודכנו");return}
 if(act==="new-task"){editorItem("task",null);return}
 if(act==="finalize-attendance"){
  const form=document.getElementById("attendanceForm");if(!form||S.busy)return;
  if(!window.confirm("לסיים את האימון ולשמור את כל סימוני הנוכחות? לא ניתן לשנות אימון לאחר סיום."))return;
  S.busy=true;try{await saveAttendance(form,true)}catch(err){toast(err.message||"שמירת הנוכחות נכשלה",true)}finally{S.busy=false}
  return;
 }
 if(act==="new-video"){videoEditor(null);return}
 if(act==="toggle-profile-block"){try{await toggleBlock(action.dataset.id)}catch(e){toast(e.message||"לא ניתן לעדכן חסימה",true)}return}
 if(act==="delete-personal-override"){try{await deleteOverride(action.dataset.scope,action.dataset.id,action.dataset.video)}catch(e){toast(e.message||"לא ניתן להסיר הרשאה",true)}return}
 if(act==="video-grants"){videoPermissionEditor(S.videos.find(v=>v.id===action.dataset.id));return}
});
document.addEventListener("input",e=>{
 if(e.target.closest?.("#drawer form"))S.dirty=true;
 if(e.target.id==="globalSearchInput"){renderGlobalSearch();return}
 if(e.target.id==="searchInput"){
  const value=e.target.value,position=e.target.selectionStart;
  S.search=value;S.page=0;render();const node=$("searchInput");if(node){node.focus();try{node.setSelectionRange(position,position)}catch(_){}}}
});
document.addEventListener("change",e=>{if(e.target.closest?.("#drawer form"))S.dirty=true});
document.addEventListener("submit",async e=>{
 const form=e.target;
 if(!["loginForm","itemForm","videoForm","videoGrantsForm","studentForm","groupForm","attendanceForm","personalGrantForm"].includes(form.id))return;
 e.preventDefault();
 if(form.id==="loginForm"){
  let btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
  try{requireData(await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value}));await init()}
  catch(err){login("הכניסה נכשלה. בדוק פרטי מנהל.",true);toast(err.message||"שגיאת התחברות",true)}
  finally{if(btn)btn.disabled=false}
  return;
 }
 if(S.profile?.role!=="admin")return;
 await saveForm(form);
});
$("drawerClose").addEventListener("click",hideDrawer);
$("drawerShade").addEventListener("click",hideDrawer);
$("menuToggle").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("mobileShade").classList.toggle("show")});
$("mobileShade").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("mobileShade").classList.remove("show")});
$("refreshBtn").addEventListener("click",refresh);
$("openSearch").addEventListener("click",openGlobalSearch);
$("globalSearchInput").addEventListener("keydown",e=>{
 if(e.key==="Enter"){
  const first=$("globalSearchResults").querySelector("button");
  if(first){e.preventDefault();first.click()}
 }
});
$("topAddBtn").addEventListener("click",()=>editorItem("task",null));
$("logoutBtn").addEventListener("click",async()=>{try{requireData(await sb.auth.signOut());S.profile=null;S.user=null;login("התנתקת בהצלחה.",true)}catch(err){toast("ההתנתקות נכשלה",true)}});
document.addEventListener("keydown",e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openGlobalSearch();return}
 if(e.key==="Escape"&&S.drawer){e.preventDefault();hideDrawer();return}
 if(e.key==="Tab"&&S.drawer){
  const els=[...$("drawer").querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length);
  if(els.length){const first=els[0],last=els[els.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 }
});
try{const wanted=new URLSearchParams(location.search).get("view");if(vlabels[wanted])S.view=wanted}catch(_){}
init();
})();