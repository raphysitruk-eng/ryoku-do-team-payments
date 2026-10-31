(function(){
"use strict";
var ROOT="https://zwgpvwxdofjidshsiaek.supabase.co";
var KEY="sb_publishable_ghdkoJZwwRIvKTsRJXr2xA_Jhfi9NS6";
var sb=window.supabase&&window.supabase.createClient(ROOT,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
var S={profile:null,user:null,tab:"library",videos:[],children:[],profiles:[],ranks:[],groups:[],groupGrants:[],childGrants:[],profileGrants:[],blocks:[],audit:[],selectedChild:"",selectedProfile:"",selectedVideo:"",selectedGroup:"",editId:"",filter:"all",message:"",error:""};
var RANKS=[["white","לבנה"],["yellow","צהובה"],["orange","כתומה"],["green","ירוקה"],["blue","כחולה"],["brown","חומה"],["black","שחורה"]];
var $=function(id){return document.getElementById(id)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var opt=function(val,label,sel){return '<option value="'+esc(val)+'"'+(String(val)===String(sel)?" selected":"")+'>'+esc(label)+'</option>'};
var labelVideo=function(v){return esc(v.title_he||"ללא שם")};
var isAdmin=function(){return S.profile&&S.profile.role==="admin"&&S.profile.approval_status==="approved"};
var tell=function(msg,err){S.message=msg||"";S.error=err?"yes":"";render()};
var yes=function(r){if(r.error)throw r.error;return r.data};
var uniq=function(x){return Array.from(new Set(x))};
var videosOpts=function(selected){return S.videos.map(function(v){return opt(v.id,v.title_he,selected)}).join("")};
var profileName=function(p){return (p.full_name||p.email||p.id||"חשבון")+" ("+(p.role||"")+")"};
var childName=function(c){return (c.first_name||"")+" "+(c.last_name||"")+(c.current_rank?" · "+c.current_rank:"")};
var button=function(act,text,extra){return '<button type="button" class="btn '+(extra||"")+'" data-act="'+act+'">'+text+'</button>'};
var choices=function(arr,sel){return arr.map(function(x){return opt(x[0],x[1],sel)}).join("")};
var msg=function(){return S.message?'<p role="status" class="'+(S.error?"error":"good")+'">'+esc(S.message)+'</p>':""};
function loginHtml(){return '<div class="panel login"><h1 class="section-title">כניסה לספריית ההדרכה</h1><p class="muted">התחברו עם חשבון האקדמיה הקיים. רק משתמשים מאושרים יוכלו לצפות בסרטונים.</p>'+msg()+'<form id="loginForm"><div class="field"><label for="email">דואר אלקטרוני</label><input type="email" autocomplete="username" id="email" required></div><div class="field"><label for="password">סיסמה</label><input type="password" autocomplete="current-password" id="password" required></div><button class="btn primary" type="submit">התחברות</button></form><p class="sm muted">אין הרשמה פתוחה. יש להתחבר עם החשבון שאושר על ידי האקדמיה. אם שכחתם את הסיסמה, פנו למנהל הארגון לקבלת קישור שחזור מאובטח.</p></div>'}
function badge(v){return v.status==="published"?'<span class="pill green">פורסם</span>':v.status==="archived"?'<span class="pill red">ארכיון</span>':'<span class="pill gold">טיוטה</span>'}
function videoCard(v){return '<article class="panel video"><div class="thumb"><span>'+ (v.category==="kata"?"🥋":v.category==="syllabus"?"🎯":"▶")+'</span></div><div class="body"><div class="row between"><span class="pill">'+esc(v.category==="kata"?"קאטה":v.category==="syllabus"?"סילבוס":v.category)+'</span>'+ (isAdmin()?badge(v):"")+'</div><h3 style="margin:12px 0 4px">'+labelVideo(v)+'</h3><p class="muted sm" style="min-height:22px">'+esc(v.variant||v.description_he||"חומר הדרכה")+'</p><div class="row">'+button("play:"+v.id,"▶ צפייה","primary")+(isAdmin()?button("edit:"+v.id,"עריכה",""):"")+'</div></div></article>'}
function libraryHtml(){
var kids=S.children.filter(function(c){return c.active});
var nav='<div class="row between"><div><h2 class="section-title">ספריית הסרטונים</h2><p class="muted sm">כל סרטון מוצג בהתאם להרשאות החשבון והחניך.</p></div><div class="row">';
if(kids.length)nav+='<label class="sm" for="childSelect">חניך:</label><select id="childSelect" style="padding:9px;border-radius:8px;border:1px solid #ccd6df">'+kids.map(function(c){return opt(c.id,childName(c),S.selectedChild)}).join("")+'</select>';
nav+='</div></div><div class="tabs">'+[["all","הכול"],["syllabus","סילבוס מבחנים"],["kata","קאטות"],["kihon","קיהון"],["kumite","קומיטה"]].map(function(x){return '<button type="button" class="tab '+(S.filter===x[0]?"active":"")+'" data-act="filter:'+x[0]+'">'+x[1]+'</button>'}).join("")+'</div>';
var vv=S.videos.filter(function(v){return (isAdmin()||v.status==="published")&&(S.filter==="all"||v.category===S.filter)});
if(!isAdmin()&&!kids.length)return nav+'<div class="panel empty">לא נמצא חניך פעיל המשויך לחשבון זה. יש לפנות למנהל.</div>';
return nav+(vv.length?'<div class="grid">'+vv.map(videoCard).join("")+'</div>':'<div class="panel empty">אין כרגע סרטונים זמינים להרשאות של החניך הנבחר.</div>')+'<p class="note sm">הסרטונים נמצאים ב-YouTube וב-Google Drive. ההרשאות מגנות על הגישה מתוך הספרייה, אך קישורים ציבוריים עלולים להיות נגישים מחוץ לה.</p>';
}
function catalogHtml(){
var v=S.videos.find(function(x){return x.id===S.editId})||null;
var form='<div class="panel"><h3 class="section-title">'+(v?"עריכת סרטון":"הוספת סרטון")+'</h3><form id="videoForm"><div class="field"><label>כותרת</label><input name="title" maxlength="180" required value="'+esc(v&&v.title_he)+'"></div><div class="field"><label>קישור YouTube או קובץ Google Drive</label><input name="url" required type="url" value="'+esc(v&&v.source_url)+'"></div><div class="two"><div class="field"><label>קטגוריה</label><select name="category">'+choices([["syllabus","סילבוס"],["kata","קאטות"],["kihon","קיהון"],["kumite","קומיטה"],["fitness","כושר"],["coach","מאמנים"],["other","אחר"]],v&&v.category||"kata")+'</select></div><div class="field"><label>מצב</label><select name="status">'+choices([["draft","טיוטה (חסום)"],["published","פורסם למורשים"],["archived","ארכיון"]],v&&v.status||"draft")+'</select></div></div><div class="field"><label>תיאור קצר / סוג ביצוע</label><input name="variant" maxlength="100" value="'+esc(v&&v.variant)+'"></div><div class="form-actions"><button class="btn primary" type="submit">שמור סרטון</button>'+button("new-video","נקה טופס","")+'</div></form><p class="sm muted">בעת פרסום, הסרטון זמין רק למי שקיבל הרשאה מפורשת או הרשאת דרגה/קבוצה.</p></div>';
var rows='<div class="panel"><h3 class="section-title">קטלוג '+S.videos.length+' סרטונים</h3>'+S.videos.map(function(x){return '<div class="list-item"><div><strong>'+labelVideo(x)+'</strong><div class="muted sm">'+esc(x.provider)+' · '+esc(x.category)+'</div></div><div class="row">'+badge(x)+button("edit:"+x.id,"עריכה","small")+'</div></div>'}).join("")+'</div>';
return '<div class="two">'+form+rows+'</div>';
}
function grantsHtml(){
var v=S.videos.find(function(x){return x.id===S.selectedVideo})||S.videos[0],p=S.profiles.find(function(x){return x.id===S.selectedProfile})||S.profiles[0];
if(!v)return '<div class="panel empty">לא נמצאו סרטונים.</div>';
var ranks=S.ranks.filter(function(x){return x.video_id===v.id}).map(function(x){return x.rank_key});
var profileChildren=S.children.filter(function(c){return p&&c.parent_id===p.id});
var ch=profileChildren[0];
var groups=S.groupGrants.filter(function(g){return g.video_id===v.id}).map(function(g){return g.group_id});
var blocked=Boolean(S.blocks.find(function(x){return p&&x.profile_id===p.id&&x.blocked}));
var vselect='<div class="field"><label for="grantVideoSelect">סרטון לבקרת הרשאות</label><select id="grantVideoSelect">'+videosOpts(v.id)+'</select></div>';
var rankBox='<div class="panel"><h3 class="section-title">הרשאות לפי חגורה</h3><form id="rankForm">'+RANKS.map(function(x){return '<label class="check"><input type="checkbox" name="rank" value="'+x[0]+'"'+(ranks.includes(x[0])?" checked":"")+'>'+x[1]+'</label>'}).join("")+'<div class="form-actions"><button type="submit" class="btn primary">שמור הרשאות דרגה</button></div></form></div>';
var groupBox='<div class="panel"><h3 class="section-title">הרשאות לפי קבוצת אימון</h3><form id="groupForm">'+S.groups.filter(function(g){return g.active}).map(function(g){return '<label class="check"><input type="checkbox" name="group" value="'+esc(g.id)+'"'+(groups.includes(g.id)?" checked":"")+'>'+esc(g.name)+' · '+esc(g.branch)+'</label>'}).join("")+(S.groups.length?"":'<p class="muted sm">לא נמצאו קבוצות פעילות.</p>')+'<div class="form-actions"><button type="submit" class="btn primary">שמור הרשאות קבוצה</button></div></form></div>';
var pselect='<div class="field"><label for="grantProfileSelect">חשבון</label><select id="grantProfileSelect">'+S.profiles.map(function(z){return opt(z.id,profileName(z),p&&p.id)}).join("")+'</select></div>';
var accessRow=function(scope,name,id){var item=scope==="child"?S.childGrants.find(function(z){return z.child_id===id&&z.video_id===v.id}):S.profileGrants.find(function(z){return z.profile_id===id&&z.video_id===v.id});return '<div class="list-item"><div><strong>'+esc(name)+'</strong><div class="muted sm">'+(item?(item.decision==="deny"?"חסום מפורשות":"הרשאה פרטנית"):"אין החלטה פרטנית")+'</div></div><div class="row">'+button("allow:"+scope+":"+id,"אשר","small primary")+button("deny:"+scope+":"+id,"חסום","small danger")+button("clear:"+scope+":"+id,"אפס","small")+'</div></div>'};
var profileBox='<div class="panel"><h3 class="section-title">הרשאות משתמש וחניכים</h3>'+pselect+(p?'<div class="row between"><span class="pill '+(blocked?"red":"green")+'">'+(blocked?"החשבון חסום מהספרייה":"החשבון אינו חסום")+'</span>'+button(blocked?"unblock:"+p.id:"block:"+p.id,blocked?"בטל חסימה":"חסום את כל הספרייה",blocked?"small primary":"small danger")+'</div><div class="form-actions">'+button("reset:"+p.id,"אפס את כל הרשאות החשבון","")+'</div><hr style="border:0;border-top:1px solid #e5ebf2;margin:16px 0">'+accessRow("profile","הרשאה לכל החשבון",p.id)+profileChildren.map(function(c){return accessRow("child",childName(c),c.id)}).join(""):'')+'<p class="sm muted">חסימה מפורשת גוברת על הרשאת דרגה וקבוצה. איפוס מסיר רק החרגות פרטניות.</p></div>';
return '<h2 class="section-title">ניהול הרשאות</h2><p class="muted">ההרשאות נבדקות במסד הנתונים בכל בקשת צפייה. גישה לקישור ציבורי חיצוני אינה ניתנת לביטול כאן.</p><div class="panel">'+vselect+'</div><div class="two" style="margin-top:16px">'+rankBox+groupBox+'</div><div style="margin-top:16px">'+profileBox+'</div>';
}
function activityHtml(){return '<h2 class="section-title">יומן שינויים</h2><div class="panel">'+(S.audit.length?S.audit.slice(0,40).map(function(a){return '<div class="list-item"><div><strong>'+esc(a.action)+'</strong> · '+esc(a.table_name)+'<div class="muted sm">'+esc(new Date(a.changed_at).toLocaleString("he-IL"))+'</div></div></div>'}).join(""):'<div class="empty">אין אירועים להצגה.</div>')+'</div>'}
function render(){var b=$("userbadge"),log=$("logoutBtn");if(!S.profile){$("root").innerHTML=loginHtml();b.textContent="";log.style.display="none";return}
b.textContent=S.profile.full_name||S.profile.email||"משתמש";log.style.display="";
var admin=isAdmin(), tabs=[["library","הספרייה"]].concat(admin?[["catalog","ניהול סרטונים"],["grants","הרשאות"],["audit","יומן שינויים"]]:[]);
var title='<div class="row between"><div><h1 class="section-title">ברוכים הבאים לספריית ההדרכה</h1><p class="muted sm">תכני הקראטה של Ryoku-Do במקום אחד.</p></div><span class="pill">'+(admin?"מנהל":"חשבון מאושר")+'</span></div>';
var nav='<nav class="tabs">'+tabs.map(function(x){return '<button class="tab '+(S.tab===x[0]?"active":"")+'" data-act="tab:'+x[0]+'">'+x[1]+'</button>'}).join("")+'</nav>';
var body=S.tab==="catalog"&&admin?catalogHtml():S.tab==="grants"&&admin?grantsHtml():S.tab==="audit"&&admin?activityHtml():libraryHtml();
$("root").innerHTML=title+nav+msg()+body;
}
function parseSource(raw){var u=new URL(raw);var h=u.hostname.toLowerCase(),id="",provider="";
if(["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be","www.youtube-nocookie.com"].includes(h)){
 provider="youtube";id=h.includes("youtu.be")?u.pathname.split("/")[1]:u.searchParams.get("v")||u.pathname.match(/\/(?:shorts|embed)\/([^/]+)/)?.[1]||"";
 if(!/^[\w-]{11}$/.test(id))throw Error("קישור YouTube אינו תקין");
}else if(h==="drive.google.com"){
 provider="google_drive";id=u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]||"";
 if(!/^[A-Za-z0-9_-]{15,}$/.test(id))throw Error("יש להזין קישור לקובץ סרטון ב-Drive, לא לתיקייה");
}else{throw Error("כרגע ניתן להוסיף קובצי YouTube ו-Google Drive בלבד");}
return {provider:provider,provider_asset_id:id,source_url:raw};}
async function refresh(){
try{
 var auth=await sb.auth.getUser();S.user=auth.data.user;S.profile=null;S.error="";S.message="";
 if(!S.user){render();return}
 S.profile=yes(await sb.from("profiles").select("id,full_name,email,role,approval_status").eq("id",S.user.id).single());
 if(S.profile.approval_status!=="approved") {S.profile=null;S.message="החשבון אינו מאושר לצפייה. יש לפנות למנהל האקדמיה.";render();return}
 if(isAdmin()){
  var r=await Promise.all([
   sb.from("training_videos").select("*").order("sort_order"),
   sb.from("children").select("id,parent_id,first_name,last_name,current_rank,branch,group_name,active").order("first_name"),
   sb.from("profiles").select("id,full_name,email,role,approval_status").order("full_name"),
   sb.from("training_video_rank_grants").select("*"),
   sb.from("training_video_group_grants").select("*"),
   sb.from("training_video_child_grants").select("*"),
   sb.from("training_video_profile_grants").select("*"),
   sb.from("training_library_blocks").select("*"),
   sb.rpc("training_admin_groups"),
   sb.from("training_video_audit").select("id,changed_at,actor,table_name,action").order("id",{ascending:false}).limit(40)
  ]);r.forEach(yes);
  [S.videos,S.children,S.profiles,S.ranks,S.groupGrants,S.childGrants,S.profileGrants,S.blocks,S.groups,S.audit]=r.map(function(z){return z.data||[]});
  if(!S.selectedProfile||!S.profiles.some(function(p){return p.id===S.selectedProfile}))S.selectedProfile=S.profiles[0]?.id||"";
  if(!S.selectedVideo||!S.videos.some(function(v){return v.id===S.selectedVideo}))S.selectedVideo=S.videos[0]?.id||"";
  if(!S.selectedChild)S.selectedChild=S.children.find(function(c){return c.active})?.id||"";
 }else{
  S.children=yes(await sb.from("children").select("id,parent_id,first_name,last_name,current_rank,branch,group_name,active").eq("parent_id",S.user.id));
  if(!S.selectedChild||!S.children.some(function(c){return c.id===S.selectedChild&&c.active}))S.selectedChild=S.children.find(function(c){return c.active})?.id||"";
  S.videos=S.selectedChild?(yes(await sb.rpc("training_videos_for_child",{p_child_id:S.selectedChild}))||[]):[];
 }
 render();
}catch(e){S.error="yes";S.message="לא ניתן לטעון נתונים: "+(e.message||"שגיאה");render()}
}
async function after(fn){try{await fn();S.message="הפעולה נשמרה בהצלחה.";await refresh();S.message="הפעולה נשמרה בהצלחה.";render()}catch(e){tell(e.message||"פעולה נכשלה",true)}}
async function setGrant(scope,id,decision,vId){var table=scope==="child"?"training_video_child_grants":"training_video_profile_grants",fk=scope==="child"?"child_id":"profile_id",query=sb.from(table);
if(decision==="clear"){yes(await query.delete().eq(fk,id).eq("video_id",vId));return}
var o={video_id:vId,decision:decision,changed_by:S.user.id,updated_at:new Date().toISOString()};o[fk]=id;
yes(await query.upsert(o,{onConflict:"video_id,"+fk}));}
function play(id){
var v=S.videos.find(function(z){return z.id===id});if(!v)return;
var media="";
if(v.provider==="youtube"&&/^[\w-]{11}$/.test(v.provider_asset_id))media="https://www.youtube-nocookie.com/embed/"+v.provider_asset_id;
if(v.provider==="google_drive"&&/^[\w-]{15,}$/.test(v.provider_asset_id))media="https://drive.google.com/file/d/"+v.provider_asset_id+"/preview";
if(!media){tell("לא ניתן להציג את הקישור הזה בנגן.",true);return}
$("playerTitle").textContent=v.title_he;$("playerContent").replaceChildren();
var iframe=document.createElement("iframe");iframe.src=media;iframe.title=v.title_he;iframe.allow="autoplay; fullscreen; encrypted-media";iframe.referrerPolicy="strict-origin-when-cross-origin";iframe.allowFullscreen=true;
$("playerContent").appendChild(iframe);$("playerOverlay").classList.add("show");
}
function closePlayer(){$("playerOverlay").classList.remove("show");$("playerContent").replaceChildren()}
document.addEventListener("click",async function(e){
var t=e.target.closest("[data-act]");if(!t)return;
var p=t.dataset.act.split(":"),act=p[0],id=p[1]||"";
if(act==="tab"){S.tab=id;S.message="";render();return}
if(act==="filter"){S.filter=id;render();return}
if(act==="play"){play(id);return}
if(!isAdmin())return;
if(act==="edit"){S.editId=id;S.tab="catalog";render();return}
if(act==="new-video"){S.editId="";render();return}
if(["allow","deny","clear"].includes(act))return after(function(){return setGrant(p[1],p[2],act,S.selectedVideo)});
if(act==="reset"){if(!confirm("לאפס את כל ההרשאות הפרטניות של החשבון? הרשאות דרגה וקבוצה יישארו פעילות."))return;return after(async function(){yes(await sb.rpc("training_reset_profile_access",{p_profile_id:id}))})}
if(act==="block"){if(!confirm("לחסום את כל גישת החשבון לספריית ההדרכה?"))return;return after(async function(){yes(await sb.rpc("training_remove_profile_access",{p_profile_id:id}))})}
if(act==="unblock"){return after(async function(){yes(await sb.rpc("training_unblock_profile_access",{p_profile_id:id}))})}
});
document.addEventListener("change",async function(e){
var id=e.target.id;
if(id==="childSelect"){S.selectedChild=e.target.value;await refresh();}
if(id==="grantVideoSelect"){S.selectedVideo=e.target.value;render()}
if(id==="grantProfileSelect"){S.selectedProfile=e.target.value;render()}
});
document.addEventListener("submit",async function(e){
var f=e.target; if(!["loginForm","videoForm","rankForm","groupForm"].includes(f.id))return;e.preventDefault();
if(f.id==="loginForm"){var email=$("email").value.trim(),password=$("password").value;try{yes(await sb.auth.signInWithPassword({email:email,password:password}));await refresh()}catch(x){tell("הכניסה נכשלה: "+(x.message||"בדוק פרטי התחברות"),true)}return}
if(!isAdmin())return;
if(f.id==="videoForm")return after(async function(){
 var fd=new FormData(f);var src=parseSource(String(fd.get("url")).trim());
 var payload={title_he:String(fd.get("title")).trim(),category:fd.get("category"),status:fd.get("status"),variant:String(fd.get("variant")||"").trim(),...src,updated_at:new Date().toISOString()};
 if(!payload.title_he||payload.title_he.length<2)throw Error("חובה כותרת");
 if(S.editId){yes(await sb.from("training_videos").update(payload).eq("id",S.editId).select("id").single())}
 else{payload.slug="video-"+Date.now().toString(36);yes(await sb.from("training_videos").insert(payload).select("id").single())}
 S.editId="";
});
if(f.id==="rankForm")return after(async function(){
 var fd=new FormData(f),vals=fd.getAll("rank").map(String),v=S.selectedVideo;
 yes(await sb.from("training_video_rank_grants").delete().eq("video_id",v));
 if(vals.length)yes(await sb.from("training_video_rank_grants").insert(vals.map(function(rank){return {video_id:v,rank_key:rank}})));
});
if(f.id==="groupForm")return after(async function(){
 var fd=new FormData(f),vals=fd.getAll("group").map(String),v=S.selectedVideo;
 yes(await sb.from("training_video_group_grants").delete().eq("video_id",v));
 if(vals.length)yes(await sb.from("training_video_group_grants").insert(vals.map(function(g){return {video_id:v,group_id:g}})));
});
});
$("closePlayer").addEventListener("click",closePlayer);$("playerOverlay").addEventListener("click",function(e){if(e.target.id==="playerOverlay")closePlayer()});
$("logoutBtn").addEventListener("click",async function(){await sb.auth.signOut();S={...S,profile:null,user:null,tab:"library",videos:[],children:[],message:"התנתקת בהצלחה.",error:""};render()});
if(!sb){$("root").innerHTML='<div class="panel empty">שירות ההתחברות לא נטען. בדוק חיבור לאינטרנט ונסה שוב.</div>';}
else{refresh()}
})();