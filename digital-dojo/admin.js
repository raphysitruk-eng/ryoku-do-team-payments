(function(){
"use strict";
var URL_BASE="https://zwgpvwxdofjidshsiaek.supabase.co";
var PUBLIC_KEY="sb_publishable_ghdkoJZwwRIvKTsRJXr2xA_Jhfi9NS6";
var sb=window.supabase?window.supabase.createClient(URL_BASE,PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
var $=function(id){return document.getElementById(id)};
var H=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var I=function(n){return '<svg aria-hidden="true"><use href="#i-'+n+'"></use></svg>'};
var RANKS=[["white","לבנה"],["yellow","צהובה"],["orange","כתומה"],["green","ירוקה"],["blue","כחולה"],["brown","חומה"],["black","שחורה"]];
var CATEGORIES=[["syllabus","סילבוס מבחן"],["kata","קאטות"],["kihon","קיהון"],["kumite","קומיטה"],["fitness","כושר"],["coach","מאמנים"],["other","אחר"]];
var PAGE_SIZE=12;
var S={user:null,profile:null,view:"overview",videos:[],profiles:[],children:[],groups:[],rankGrants:[],groupGrants:[],childGrants:[],profileGrants:[],blocks:[],audit:[],search:"",status:"all",category:"all",page:1,activityFilter:"all",drawer:null,loading:false,menu:false};
try{var requested=new URLSearchParams(location.search).get("view");if(["overview","videos","permissions","members","activity"].includes(requested))S.view=requested}catch(_){}
var labelCat=function(cat){var x=CATEGORIES.find(function(z){return z[0]===cat});return x?x[1]:cat||"אחר"};
var labelRank=function(rank){var x=RANKS.find(function(z){return z[0]===rank});return x?x[1]:rank};
var fmtDate=function(d){if(!d)return "—";var date=new Date(d);return Number.isNaN(date.getTime())?"—":date.toLocaleDateString("he-IL",{day:"2-digit",month:"short",year:"numeric"})};
var fmtTime=function(d){if(!d)return "";var date=new Date(d);return Number.isNaN(date.getTime())?"":date.toLocaleString("he-IL",{dateStyle:"short",timeStyle:"short"})};
var vid=function(id){return S.videos.find(function(v){return v.id===id})};
var member=function(id){return S.profiles.find(function(p){return p.id===id})};
var child=function(id){return S.children.find(function(c){return c.id===id})};
var gname=function(id){var x=S.groups.find(function(g){return g.id===id});return x?(x.name+" · "+x.branch):"קבוצה"};
var pname=function(p){return p?(p.full_name||p.email||"חשבון ללא שם"):"חשבון"};
var cname=function(c){return c?((c.first_name||"")+" "+(c.last_name||"")).trim():"חניך"};
var ownerKids=function(id){return S.children.filter(function(c){return c.parent_id===id})};
var isBlocked=function(id){return S.blocks.some(function(x){return x.profile_id===id&&x.blocked})};
var isActiveOverride=function(g){return !g.expires_at||new Date(g.expires_at)>new Date()};
var choice=function(value,label,selected){return '<option value="'+H(value)+'"'+(String(value)===String(selected)?" selected":"")+'>'+H(label)+'</option>'};
var statTag=function(status){var text={published:"פורסם",draft:"טיוטה",archived:"בארכיון"}[status]||status;return '<span class="tag '+H(status)+'">'+H(text)+'</span>'};
var decisionTag=function(d){return '<span class="tag '+H(d)+'">'+(d==="allow"?"מותר":"חסום")+'</span>'};
var btn=function(action,text,cls,id){return '<button type="button" class="btn '+(cls||"")+'" data-action="'+H(action)+'"'+(id?' data-id="'+H(id)+'"':"")+'>'+text+'</button>'};
var hasChanged=false;
function assert(result){if(result.error)throw result.error;return result.data}
function gate(message,formVisible){
 $("shell").classList.add("hide");$("authGate").classList.remove("hide");
 $("gateMessage").textContent=message||"יש להתחבר באמצעות חשבון המנהל.";
 $("loginForm").classList.toggle("hide",!formVisible);
}
function authenticated(){
 $("authGate").classList.add("hide");$("shell").classList.remove("hide");
 var title=pname(S.profile);
 $("accountName").textContent=title;
 $("accountAvatar").textContent=(title.trim()[0]||"R").toUpperCase();
 $("navVideoCount").textContent=String(S.videos.length);
}
function notify(message,error){
 var node=document.createElement("div");node.className="toast"+(error?" error":"");
 node.innerHTML=I(error?"info":"check")+'<span>'+H(message)+'</span>';
 $("toastStack").appendChild(node);
 setTimeout(function(){node.remove()},4800);
}
function clearMobile(){S.menu=false;$("sidebar").classList.remove("open");$("mobileShade").classList.remove("show")}
function header(title,subtitle,actions){return '<div class="content-head"><div><div class="date-stamp">'+H(new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long",year:"numeric"}))+'</div><h1>'+H(title)+'</h1><p>'+H(subtitle||"")+'</p></div><div class="actions">'+(actions||"")+'</div></div>'}
function metric(label,value,note,icon,color){return '<article class="metric '+(color||"")+'"><div class="label"><span>'+H(label)+'</span><span class="icon-swatch">'+I(icon)+'</span></div><div class="number">'+value+'</div><div class="note">'+H(note)+'</div></article>'}
function categoryDistribution(){
 var counts=CATEGORIES.map(function(c){return {key:c[0],name:c[1],n:S.videos.filter(function(v){return v.category===c[0]}).length}}).filter(function(x){return x.n>0});
 var max=Math.max(1,...counts.map(function(x){return x.n}));
 return counts.map(function(x){return '<div class="category-row"><span class="label">'+H(x.name)+'</span><div class="progress-track" role="img" aria-label="'+H(x.name+" "+x.n)+'"><div class="progress-fill" style="width:'+Math.round(x.n/max*100)+'%"></div></div><span class="n">'+x.n+'</span></div>'}).join("");
}
function actionName(action){
 return {INSERT:"יצירה",UPDATE:"עדכון",DELETE:"הסרה"}[action]||action||"אירוע";
}
function eventName(e){
 var text={training_videos:"סרטון",training_video_rank_grants:"הרשאת חגורה",training_video_group_grants:"הרשאת קבוצה",training_video_child_grants:"הרשאת חניך",training_video_profile_grants:"הרשאת חשבון",training_library_blocks:"חסימת חשבון"}[e.table_name]||e.table_name;
 return actionName(e.action)+" · "+text;
}
function timeline(limit){
 return '<ul class="activity-feed">'+S.audit.slice(0,limit).map(function(e){return '<li class="feed-item"><span class="feed-dot"></span><div><strong>'+H(eventName(e))+'</strong><small>'+H(fmtTime(e.changed_at))+'</small></div></li>'}).join("")+'</ul>';
}
function dashboard(){
 var published=S.videos.filter(function(v){return v.status==="published"}).length;
 var drafts=S.videos.filter(function(v){return v.status==="draft"}).length;
 var blocked=S.blocks.filter(function(b){return b.blocked}).length;
 var kinds=S.videos.reduce(function(o,v){o[v.provider]=(o[v.provider]||0)+1;return o},{});
 var grantCount=S.rankGrants.length+S.groupGrants.length+S.childGrants.length+S.profileGrants.length;
 var hero='<section class="hero-card"><div><div class="eyebrow">YOUR DIGITAL DOJO · CONTROL CENTER</div><h2>כל סרטון, כל חניך, בשליטה שלך.</h2><p>מקום אחד לניהול חומרי הלימוד, התאמת גישה לפי דרגה וחניך, ופיקוח על כל שינוי.</p></div>'+btn("add-video",I("plus")+" הוסף סרטון","primary")+'</section>';
 var counts='<div class="metric-grid">'+metric("סרטונים בספרייה",S.videos.length,"כל חומרי ההדרכה", "film")+metric("פורסמו לחניכים",published,"בהתאם להרשאות", "eye","teal")+metric("ממתינים לפרסום",drafts,"טיוטות שלא נפתחו", "clock","amber")+metric("חשבונות חסומים",blocked,"חסימה מהספרייה בלבד","lock","rose")+'</div>';
 var activity='<section class="panel"><div class="panel-head"><h2>פעילות אחרונה</h2><button class="tiny-link" data-action="go-activity">לכל הפעולות '+I("chevron")+'</button></div>'+(S.audit.length?timeline(6):'<div class="empty">טרם נרשמו שינויים</div>')+'</section>';
 var dist='<section class="panel"><div class="panel-head"><h2>תוכן לפי קטגוריה</h2><span class="tag">'+S.videos.length+' סרטונים</span></div>'+categoryDistribution()+'</section>';
 var quick='<section class="panel"><div class="panel-head"><h2>קיצורי דרך</h2></div><div class="quick-list">'+
 '<button class="quick-link" data-action="add-video">'+I("plus")+' הוספת סרטון חדש'+I("chevron")+'</button>'+
 '<button class="quick-link" data-action="go-permissions">'+I("shield")+' עריכת הרשאות לחגורות ולקבוצות'+I("chevron")+'</button>'+
 '<button class="quick-link" data-action="go-members">'+I("users")+' הסרת גישה או איפוס הרשאות'+I("chevron")+'</button>'+
 '</div></section>';
 var sourceInfo='<section class="panel"><div class="panel-head"><h2>תמונת מצב</h2></div><div class="subrow"><strong>חשבונות מאושרים</strong><span class="tag">'+S.profiles.filter(function(p){return p.approval_status==="approved"}).length+'</span></div>'+
 '<div class="subrow"><strong>חניכים רשומים במערכת</strong><span class="tag">'+S.children.length+'</span></div>'+
 '<div class="subrow"><strong>שיוכי הרשאות</strong><span class="tag">'+grantCount+'</span></div>'+
 '<div class="subrow"><strong>סרטונים מ־YouTube</strong><span class="tag">'+(kinds.youtube||0)+'</span></div>'+
 '<div class="subrow"><strong>סרטונים מ־Google Drive</strong><span class="tag">'+(kinds.google_drive||0)+'</span></div></section>';
 var caution='<div class="alert-bar">'+I("info")+'<span><strong>אבטחת תוכן:</strong> חסימה כאן מונעת צפייה דרך Digital Dojo; קישור YouTube או Drive ששותף באופן ציבורי עדיין עלול להיפתח מחוץ למערכת. לפריטי תוכן רגישים נדרש אירוח פרטי.</span></div>';
 return header("סקירה כללית","לוח הבקרה של ספריית ההדרכה הדיגיטלית",'<a class="btn secondary" href="./" target="_blank" rel="noopener noreferrer">'+I("external")+' פתח ספריית חניכים</a>')+hero+counts+'<div class="overview-grid">'+dist+activity+'</div><div class="overview-grid">'+quick+sourceInfo+'</div>'+caution;
}
function videoThumb(v){
 if(v.provider==="youtube"&&/^[\w-]{11}$/.test(v.provider_asset_id))return '<span class="thumb"><img loading="lazy" src="https://img.youtube.com/vi/'+H(v.provider_asset_id)+'/mqdefault.jpg" alt=""></span>';
 return '<span class="thumb">'+I("film")+'</span>';
}
function videoAccessSummary(v){
 var rr=S.rankGrants.filter(function(x){return x.video_id===v.id}).length;
 var gg=S.groupGrants.filter(function(x){return x.video_id===v.id}).length;
 var pp=S.profileGrants.filter(function(x){return x.video_id===v.id&&x.decision==="allow"&&isActiveOverride(x)}).length+S.childGrants.filter(function(x){return x.video_id===v.id&&x.decision==="allow"&&isActiveOverride(x)}).length;
 return rr+gg+pp;
}
function videoRows(){
 var vs=S.videos.filter(function(v){var k=(v.title_he+" "+v.category+" "+v.variant+" "+v.description_he).toLowerCase();
 return (S.status==="all"||v.status===S.status)&&(S.category==="all"||v.category===S.category)&&(!S.search||k.includes(S.search.toLowerCase()))});
 vs=vs.slice().sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0)||a.title_he.localeCompare(b.title_he,"he")});
 var total=vs.length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));S.page=Math.min(Math.max(1,S.page),pages);
 var page=vs.slice((S.page-1)*PAGE_SIZE,S.page*PAGE_SIZE);
 var rows=page.map(function(v){return '<tr class="clickable" data-row="video" data-id="'+H(v.id)+'"><td><div class="td-primary">'+videoThumb(v)+'<div><strong title="'+H(v.title_he)+'">'+H(v.title_he)+'</strong><small>'+H(v.variant||v.provider.replace("_"," "))+'</small></div></div></td><td>'+H(labelCat(v.category))+'</td><td>'+statTag(v.status)+'</td><td><span class="token">'+I("shield")+" "+videoAccessSummary(v)+' שיוכים</span></td><td>'+H(fmtDate(v.updated_at))+'</td><td><div class="td-actions"><button class="mini-action" data-action="open-video" data-id="'+H(v.id)+'">עריכה</button><button class="mini-action" data-action="open-video-grants" data-id="'+H(v.id)+'">הרשאות</button></div></td></tr>'}).join("");
 return {rows:rows,total:total,pages:pages};
}
function pager(total,pages){
 if(pages<=1)return '<div class="subtle" style="margin-top:12px">סה״כ '+total+' תוצאות</div>';
 return '<div class="button-row" style="justify-content:space-between;margin-top:15px"><span class="subtle">עמוד '+S.page+' מתוך '+pages+' · '+total+' תוצאות</span><div class="button-row">'+
 '<button class="btn small" data-action="page-back"'+(S.page===1?" disabled":"")+'>הקודם</button><button class="btn small" data-action="page-next"'+(S.page===pages?" disabled":"")+'>הבא</button></div></div>';
}
function videosView(){
 var r=videoRows();
 var filters='<div class="toolbar"><label class="searchbox">'+I("search")+'<input id="mainSearch" aria-label="חיפוש סרטונים" placeholder="חיפוש סרטון, קאטה או חומר לימוד…" value="'+H(S.search)+'"></label>'+
 '<select id="statusFilter" aria-label="סינון לפי מצב">'+[["all","כל המצבים"],["published","פורסם"],["draft","טיוטה"],["archived","ארכיון"]].map(function(x){return choice(x[0],x[1],S.status)}).join("")+'</select>'+
 '<select id="categoryFilter" aria-label="סינון לפי קטגוריה">'+choice("all","כל הקטגוריות",S.category)+CATEGORIES.map(function(x){return choice(x[0],x[1],S.category)}).join("")+'</select>'+
 '<span class="count-label">'+r.total+' פריטים</span></div>';
 var th='<thead><tr><th>סרטון</th><th>קטגוריה</th><th>מצב פרסום</th><th>הרשאות</th><th>עודכן</th><th style="text-align:left">פעולות</th></tr></thead>';
 var body=r.rows?'<div class="table-wrap"><table class="data-table">'+th+'<tbody>'+r.rows+'</tbody></table></div>'+pager(r.total,r.pages):empty("film","לא נמצאו סרטונים","נסה לשנות את המסננים או להוסיף סרטון חדש.");
 return header("ספריית הסרטונים","נהל את התוכן, את מצב הפרסום ואת ההרשאות לכל סרטון",btn("add-video",I("plus")+" סרטון חדש","primary")+btn("export-videos",I("download")+" יצוא CSV","secondary"))+
 '<section class="panel">'+filters+body+'</section>';
}
function permissionView(){
 var items=S.videos.slice().sort(function(a,b){return a.category.localeCompare(b.category)||a.title_he.localeCompare(b.title_he,"he")});
 var show=items.filter(function(v){return !S.search||(v.title_he+" "+v.category).toLowerCase().includes(S.search.toLowerCase())});
 var rows=show.map(function(v){
 var rank=S.rankGrants.filter(function(g){return g.video_id===v.id}).map(function(g){return labelRank(g.rank_key)}).join(", ");
 var group=S.groupGrants.filter(function(g){return g.video_id===v.id}).map(function(g){return gname(g.group_id)}).join(", ");
 var personal=S.profileGrants.filter(function(g){return g.video_id===v.id&&isActiveOverride(g)}).length+S.childGrants.filter(function(g){return g.video_id===v.id&&isActiveOverride(g)}).length;
 return '<tr><td><div class="td-primary">'+videoThumb(v)+'<div><strong>'+H(v.title_he)+'</strong><small>'+H(labelCat(v.category))+'</small></div></div></td><td>'+statTag(v.status)+'</td><td>'+H(rank||"לא הוגדר")+'</td><td>'+H(group||"לא הוגדר")+'</td><td>'+personal+'</td><td><button class="mini-action" data-action="open-video-grants" data-id="'+H(v.id)+'">הגדר הרשאות</button></td></tr>';
 }).join("");
 return header("הרשאות גישה","שייך סרטונים לחגורות ולקבוצות; הרשאות פרטניות מנוהלות בכרטיס המשתמש")+
 '<div class="alert-bar" style="margin:0 0 18px">'+I("shield")+' חסימה מפורשת של חשבון או חניך גוברת על הרשאה לפי חגורה וקבוצה. סרטון במצב טיוטה אינו מוצג לחניכים גם אם הוגדרו הרשאות.</div>'+
 '<section class="panel"><div class="toolbar"><label class="searchbox">'+I("search")+'<input id="mainSearch" aria-label="חיפוש סרטון" placeholder="חיפוש סרטון…" value="'+H(S.search)+'"></label><span class="count-label">'+show.length+' סרטונים</span></div>'+
 (rows?'<div class="table-wrap"><table class="data-table"><thead><tr><th>סרטון</th><th>פרסום</th><th>חגורות</th><th>קבוצות</th><th>החרגות</th><th>פעולה</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty("shield","אין סרטונים","לא נמצאו תוצאות."))+'</section>';
}
function peopleView(){
 var profiles=S.profiles.filter(function(p){var kids=ownerKids(p.id);
 return !S.search||(pname(p)+" "+(p.email||"")+" "+kids.map(cname).join(" ")).toLowerCase().includes(S.search.toLowerCase())});
 var rows=profiles.map(function(p){
 var linked=ownerKids(p.id),blocked=isBlocked(p.id);
 return '<tr class="clickable" data-row="member" data-id="'+H(p.id)+'"><td><div class="td-primary"><span class="avatar-small">'+H(pname(p).trim()[0]||"R")+'</span><div><strong>'+H(pname(p))+'</strong><small>'+H(p.email||"—")+'</small></div></div></td><td>'+H(p.role==="admin"?"מנהל":p.role==="coach"?"מאמן":"הורה")+'</td><td>'+linked.length+' חניכים</td><td>'+H(p.approval_status==="approved"?"מאושר":"לא מאושר")+'</td><td>'+(blocked?'<span class="tag blocked">גישה חסומה</span>':'<span class="tag allow">אין חסימה</span>')+'</td><td><button class="mini-action" data-action="open-member" data-id="'+H(p.id)+'">ניהול הרשאות</button></td></tr>';
 }).join("");
 return header("חניכים ומשתמשים","שלוט בגישה ברמת חשבון הורה, חניך וסרטון ספציפי",btn("export-users",I("download")+" יצוא רשימה","secondary"))+
 '<div class="metric-grid" style="margin-bottom:18px">'+metric("חשבונות",S.profiles.length,"במערכת ההרשאות","users")+metric("חניכים",S.children.length,"כולל חניכים ללא חשבון","book")+metric("חסימות פעילות",S.blocks.filter(function(x){return x.blocked}).length,"ניתן לבטל בכל עת","lock","rose")+metric("החרגות אישיות",S.profileGrants.length+S.childGrants.length,"הרשאות וביטולים פרטניים","shield","teal")+'</div>'+
 '<section class="panel"><div class="toolbar"><label class="searchbox">'+I("search")+'<input id="mainSearch" aria-label="חיפוש משתמש" placeholder="שם הורה, דוא״ל או שם חניך…" value="'+H(S.search)+'"></label><span class="count-label">'+profiles.length+' חשבונות</span></div>'+
 (rows?'<div class="table-wrap"><table class="data-table"><thead><tr><th>חשבון</th><th>תפקיד</th><th>חניכים</th><th>אישור</th><th>גישה לספרייה</th><th>פעולה</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty("users","לא נמצאו משתמשים","נסה חיפוש אחר."))+'</section>';
}
function activityView(){
 var list=S.audit.filter(function(a){return (S.activityFilter==="all"||a.action===S.activityFilter)&&(!S.search||(eventName(a)+" "+fmtTime(a.changed_at)).toLowerCase().includes(S.search.toLowerCase()))});
 var rows=list.map(function(a){var actor=member(a.actor);
 return '<tr><td><span class="token">'+I("clock")+' '+H(fmtTime(a.changed_at))+'</span></td><td><strong>'+H(eventName(a))+'</strong></td><td>'+H(actor?pname(actor):"פעולת מערכת")+'</td><td>'+H(a.table_name)+'</td></tr>';
 }).join("");
 return header("יומן פעילות","תיעוד שינויים בתוכן ובהרשאות",btn("export-activity",I("download")+" יצוא יומן","secondary"))+
 '<section class="panel"><div class="toolbar"><label class="searchbox">'+I("search")+'<input id="mainSearch" placeholder="חיפוש אירוע…" aria-label="חיפוש פעילות" value="'+H(S.search)+'"></label>'+
 '<select id="activityFilter"><option value="all">כל הפעולות</option>'+[["INSERT","יצירה"],["UPDATE","עדכון"],["DELETE","הסרה"]].map(function(x){return choice(x[0],x[1],S.activityFilter)}).join("")+'</select>'+
 '<span class="count-label">עד '+S.audit.length+' הפעולות האחרונות</span></div>'+
 (rows?'<div class="table-wrap"><table class="data-table audit-table"><thead><tr><th>זמן</th><th>פעולה</th><th>מבצע</th><th>אזור במערכת</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty("clock","אין אירועים מתאימים","היומן יוצג לאחר ביצוע פעולות."))+'</section>';
}
function empty(icon,title,desc){return '<div class="empty"><div class="empty-icon">'+I(icon)+'</div><strong>'+H(title)+'</strong>'+H(desc||"")+'</div>'}
function render(){
 authenticated();
 var labels={overview:"סקירה כללית",videos:"ספריית סרטונים",permissions:"הרשאות גישה",members:"חניכים ומשתמשים",activity:"יומן פעילות"};
 $("currentPageLabel").textContent=labels[S.view];
 document.querySelectorAll("[data-view]").forEach(function(el){var on=el.dataset.view===S.view;el.classList.toggle("active",on);if(on)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current")});
 var body={overview:dashboard,videos:videosView,permissions:permissionView,members:peopleView,activity:activityView}[S.view]();
 $("content").innerHTML=body;
 if(S.drawer)renderDrawer();
}
function navigate(view){
 if(!["overview","videos","permissions","members","activity"].includes(view))return;
 S.view=view;S.search="";S.page=1;S.status="all";S.category="all";S.activityFilter="all";
 history.replaceState(null,"","admin.html?view="+encodeURIComponent(view));
 clearMobile();closeDrawer();render();$("content").focus();
}
async function loadAll(){
 var jobs=[
 ["videos",sb.from("training_videos").select("*").order("sort_order",{ascending:true}).limit(1000)],
 ["profiles",sb.from("profiles").select("id,full_name,email,role,approval_status").order("full_name").limit(1000)],
 ["children",sb.from("children").select("id,parent_id,first_name,last_name,current_rank,next_rank,branch,group_name,active").order("first_name").limit(1000)],
 ["groups",sb.rpc("training_admin_groups")],
 ["rankGrants",sb.from("training_video_rank_grants").select("*").limit(1000)],
 ["groupGrants",sb.from("training_video_group_grants").select("*").limit(1000)],
 ["childGrants",sb.from("training_video_child_grants").select("*").limit(1000)],
 ["profileGrants",sb.from("training_video_profile_grants").select("*").limit(1000)],
 ["blocks",sb.from("training_library_blocks").select("*").limit(1000)],
 ["audit",sb.from("training_video_audit").select("id,changed_at,actor,table_name,action").order("id",{ascending:false}).limit(150)]
 ];
 var data=await Promise.all(jobs.map(function(x){return x[1]}));
 data.forEach(function(r,i){S[jobs[i][0]]=assert(r)||[]});
}
function isMissingAuthSession(error){
 if(!error)return false;
 var name=String(error.name||"");
 var code=String(error.code||"");
 var message=String(error.message||"");
 return name==="AuthSessionMissingError"||code==="session_not_found"||code==="auth_session_missing"||/auth session missing|session missing/i.test(message);
}
function showLogin(message){
 S.user=null;S.profile=null;
 gate(message||"יש להתחבר עם חשבון מנהל מאושר.",true);
}
async function authorize(){
 if(!sb){gate("לא ניתן לטעון את שירות ההתחברות. יש לרענן את הדף.",false);return}
 try{
  // An unauthenticated visitor is a normal state. Never call getUser or
  // show a fatal page error when the browser has no saved session.
  var sessionResponse=await sb.auth.getSession();
  if(sessionResponse.error){
   if(isMissingAuthSession(sessionResponse.error)){showLogin("יש להתחבר עם חשבון מנהל מאושר.");return}
   throw sessionResponse.error;
  }
  if(!sessionResponse.data||!sessionResponse.data.session){
   showLogin("יש להתחבר עם חשבון מנהל מאושר.");
   return;
  }
  // getSession only checks local browser state; getUser verifies identity.
  var auth=await sb.auth.getUser();
  if(auth.error){
   if(isMissingAuthSession(auth.error)){showLogin("תוקף ההתחברות פג. יש להתחבר מחדש.");return}
   throw auth.error;
  }
  S.user=auth.data&&auth.data.user;
  if(!S.user){showLogin("יש להתחבר עם חשבון מנהל מאושר.");return}
  S.profile=assert(await sb.from("profiles").select("id,full_name,email,role,approval_status").eq("id",S.user.id).single());
  if(S.profile.role!=="admin"||S.profile.approval_status!=="approved"){
   gate("החשבון המחובר אינו בעל הרשאת מנהל. התחבר בחשבון המנהל או עבור לספריית החניכים.",true);
   return;
  }
  await loadAll();
  render();
 }catch(err){
  if(isMissingAuthSession(err)){showLogin("תוקף ההתחברות פג. יש להתחבר מחדש.");return}
  gate("לא ניתן לטעון את המערכת: "+(err.message||"שגיאת חיבור"),true);
 }
}
async function mutate(task,okMessage){
 if(S.loading)return;S.loading=true;document.body.style.cursor="progress";
 try{await task();await loadAll();render();notify(okMessage||"העדכון בוצע בהצלחה",false)}
 catch(err){notify(err.message||"לא ניתן לבצע פעולה",true)}
 finally{S.loading=false;document.body.style.cursor=""}
}
function showDrawer(kind,id,tab){
 S.drawer={kind:kind,id:id||null,tab:tab||"details"};
 $("drawer").classList.remove("hide");$("drawerShade").classList.remove("hide");
 document.body.style.overflow="hidden";
 renderDrawer();$("drawerClose").focus();
}
function closeDrawer(){
 S.drawer=null;$("drawer").classList.add("hide");$("drawerShade").classList.add("hide");document.body.style.overflow="";
}
function drawerHeader(title,eyebrow){$("drawerTitle").textContent=title;$("drawerEyebrow").textContent=eyebrow||"RYOKU-DO ADMIN"}
function drawerTabs(active){
 return '<div class="subnav"><button type="button" data-action="drawer-tab" data-tab="details" class="'+(active==="details"?"active":"")+'">פרטי הסרטון</button>'+
 '<button type="button" data-action="drawer-tab" data-tab="grants" class="'+(active==="grants"?"active":"")+'">הרשאות דרגה וקבוצה</button></div>';
}
function editVideoPane(v){
 var values={title_he:v&&v.title_he||"",source_url:v&&v.source_url||"",description_he:v&&v.description_he||"",variant:v&&v.variant||"",sort_order:v&&v.sort_order||0,category:v&&v.category||"kata",status:v&&v.status||"draft"};
 var source=v?'<div class="drawer-section"><div class="button-row"><span class="tag">'+H(v.provider==="google_drive"?"Google Drive":v.provider==="youtube"?"YouTube":v.provider)+'</span>'+statTag(v.status)+
 '<a class="tiny-link" href="'+H(v.source_url)+'" target="_blank" rel="noopener noreferrer">'+I("external")+' קישור מקור</a></div><p class="muted-note" style="margin:9px 0 0">עדכון מקור הווידאו לא ישנה את קובץ המקור עצמו.</p></div>':"";
 return '<form id="videoForm" class="form-stack"><div class="field"><label for="vTitle">כותרת הסרטון *</label><input id="vTitle" name="title_he" maxlength="180" value="'+H(values.title_he)+'" required></div>'+
 '<div class="field"><label for="vUrl">קישור לקובץ YouTube או Google Drive *</label><input id="vUrl" name="source_url" type="url" required value="'+H(values.source_url)+'"><span class="input-note">ניתן להוסיף קישור לסרטון יחיד; לא קישור לתיקייה.</span></div>'+
 '<div class="field-row"><div class="field"><label for="vCategory">קטגוריה</label><select id="vCategory" name="category">'+CATEGORIES.map(function(c){return choice(c[0],c[1],values.category)}).join("")+'</select></div>'+
 '<div class="field"><label for="vStatus">מצב</label><select id="vStatus" name="status">'+[["draft","טיוטה – חסום"],["published","פורסם למורשים"],["archived","ארכיון"]].map(function(x){return choice(x[0],x[1],values.status)}).join("")+'</select></div></div>'+
 '<div class="field"><label for="vVariant">סוג ביצוע / תת־כותרת</label><input id="vVariant" name="variant" maxlength="140" value="'+H(values.variant)+'" placeholder="לדוגמה: ביצוע איטי"></div>'+
 '<div class="field"><label for="vDesc">תיאור הסרטון</label><textarea id="vDesc" name="description_he" maxlength="1600" placeholder="פרטים והנחיות לחניכים">'+H(values.description_he)+'</textarea></div>'+
 '<div class="field" style="max-width:140px"><label for="vOrder">סדר תצוגה</label><input id="vOrder" name="sort_order" type="number" step="1" value="'+H(values.sort_order)+'"></div>'+
 '<div class="warning-box">'+I("info")+' פרסום סרטון אינו פותח אותו לכולם. יש להגדיר הרשאות מתאימות בלשונית ההרשאות.</div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' '+(v?"שמור שינויים":"הוסף סרטון")+'</button></form>'+source;
}
function grantPane(v){
 var ranks=S.rankGrants.filter(function(r){return r.video_id===v.id}).map(function(r){return r.rank_key});
 var groups=S.groupGrants.filter(function(r){return r.video_id===v.id}).map(function(r){return r.group_id});
 var rankHtml=RANKS.map(function(r){return '<label class="check-choice"><input type="checkbox" name="rank" value="'+H(r[0])+'"'+(ranks.includes(r[0])?" checked":"")+'>'+H(r[1])+'</label>'}).join("");
 var groupHtml=S.groups.filter(function(g){return g.active}).map(function(g){return '<label class="check-choice"><input type="checkbox" name="group" value="'+H(g.id)+'"'+(groups.includes(g.id)?" checked":"")+'><span>'+H(g.name)+'<small style="display:block;font-weight:400;color:#8593a5">'+H(g.branch||"")+'</small></span></label>'}).join("");
 var personCount=S.profileGrants.filter(function(x){return x.video_id===v.id}).length+S.childGrants.filter(function(x){return x.video_id===v.id}).length;
 return '<form id="grantForm" class="form-stack"><div><h3 class="section-label">פתיחה לפי חגורה</h3><p class="helper-text">בחר את הדרגות שבהן החומר יהיה זמין. מי שאינו בעל דרגה מתאימה לא יקבל גישה אוטומטית.</p><div class="check-grid">'+rankHtml+'</div></div>'+
 '<div><h3 class="section-label">פתיחה לפי קבוצות אימון</h3><p class="helper-text">לדוגמה: קבוצת נבחרת או סניף מוגדר.</p><div class="check-grid">'+(groupHtml||'<p class="muted">אין קבוצות פעילות במערכת.</p>')+'</div></div>'+
 '<div class="warning-box">'+I("shield")+' '+personCount+' החרגות אישיות קיימות עבור סרטון זה. הן יישמרו גם לאחר שינוי ההרשאות הקבוצתיות.</div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' שמור הרשאות סרטון</button></form>';
}
function videoDrawer(){
 var v=vid(S.drawer.id);drawerHeader(v?v.title_he:"סרטון חדש",v?"VIDEO MANAGEMENT":"ADD NEW CONTENT");
 if(!v)S.drawer.tab="details";
 $("drawerBody").innerHTML=(v?drawerTabs(S.drawer.tab):"")+(S.drawer.tab==="grants"&&v?grantPane(v):editVideoPane(v));
}
function profileOverrides(p){
 var kids=ownerKids(p.id),kidIds=kids.map(function(c){return c.id});
 var acc=S.profileGrants.filter(function(x){return x.profile_id===p.id});
 var ch=S.childGrants.filter(function(x){return kidIds.includes(x.child_id)});
 var entries=acc.map(function(x){return {...x,scope:"profile",scope_id:p.id,who:"כל החשבון"}}).concat(ch.map(function(x){return {...x,scope:"child",scope_id:x.child_id,who:cname(child(x.child_id))}}));
 if(!entries.length)return '<div class="empty" style="padding:22px">'+I("shield")+' אין החרגות אישיות בחשבון זה.</div>';
 return entries.map(function(x){var v=vid(x.video_id);
 return '<div class="override-item"><div><strong>'+H(v?v.title_he:"סרטון שהוסר")+'</strong><small>'+H(x.who)+' · '+(x.expires_at?"עד "+H(fmtTime(x.expires_at)):"ללא תפוגה")+'</small></div><div class="button-row">'+decisionTag(x.decision)+
 '<button type="button" class="mini-action" data-action="clear-override" data-id="'+H(x.scope_id)+'" data-scope="'+H(x.scope)+'" data-video="'+H(x.video_id)+'">הסר</button></div></div>';
 }).join("");
}
function memberDrawer(){
 var p=member(S.drawer.id);if(!p){closeDrawer();return}
 drawerHeader(pname(p),"MEMBER ACCESS MANAGEMENT");
 var kids=ownerKids(p.id),blocked=isBlocked(p.id),self=p.id===S.user.id;
 var summary='<div class="drawer-section"><div class="avatar-wide"><span class="avatar-small">'+H(pname(p)[0]||"R")+'</span><div><strong>'+H(pname(p))+'</strong><div class="muted-note">'+H(p.email||"אין דוא״ל מוצג")+'</div></div></div><div class="button-row" style="margin-top:12px">'+
 '<span class="tag">'+(p.role==="admin"?"מנהל":p.role==="coach"?"מאמן":"הורה")+'</span>'+
 (blocked?'<span class="tag blocked">חסום מספרייה</span>':'<span class="tag allow">לא חסום</span>')+
 '<span class="tag">'+kids.length+' חניכים</span></div></div>';
 var target=[["profile:"+p.id,"כל החשבון"]].concat(kids.map(function(c){return ["child:"+c.id,cname(c)+" · "+(c.current_rank||"דרגה לא ידועה")]}));
 var grant='<section><h3 class="section-label">גישה לסרטון מסוים</h3><p class="helper-text">הרשאה או חסימה מפורשת גוברות על הגדרות הקבוצה והדרגה. ניתן לבטל כל החרגה בכל רגע.</p>'+
 '<form id="personalGrantForm" class="form-stack"><div class="field"><label>סרטון</label><select name="video_id" required>'+S.videos.map(function(v){return choice(v.id,v.title_he,"")}).join("")+'</select></div>'+
 '<div class="field"><label>למי</label><select name="scope" required>'+target.map(function(x){return choice(x[0],x[1],"")}).join("")+'</select></div>'+
 '<div class="field-row"><div class="field"><label>פעולה</label><select name="decision">'+[["allow","תן גישה"],["deny","חסום סרטון"],["clear","הסר החרגה"]].map(function(x){return choice(x[0],x[1],"allow")}).join("")+'</select></div>'+
 '<div class="field"><label>תוקף עד (אופציונלי)</label><input type="datetime-local" name="expires_at"><span class="input-note">ההחרגה תפקע אוטומטית במועד שנבחר.</span></div></div>'+
 '<button type="submit" class="btn primary full">'+I("check")+' החל הרשאה אישית</button></form></section>';
 var exceptions='<section><h3 class="section-label">החרגות פעילות ושמורות</h3>'+profileOverrides(p)+'</section>';
 var danger='<section class="danger-zone"><strong>ניהול גישה גורף</strong><p class="muted-note" style="margin:7px 0 15px">חסימה מסירה גישה לספרייה, אך אינה מוחקת את המשתמש או את נתוני החניכים. איפוס מוחק החרגות פרטניות ומבטל חסימה קיימת.</p><div class="button-row">'+
 (blocked?btn("unblock-member",I("check")+" בטל חסימת חשבון","secondary",p.id):btn("block-member",I("lock")+" חסום חשבון מהספרייה","danger",p.id))+
 btn("reset-member",I("refresh")+" אפס את הרשאות החשבון","secondary",p.id)+'</div>'+(self?'<div class="warning-box">לא ניתן לחסום או לאפס את חשבון המנהל הראשי מתוך ממשק זה.</div>':"")+'</section>';
 $("drawerBody").innerHTML=summary+grant+'<hr>'+exceptions+danger;
 if(self){$("drawerBody").querySelectorAll('[data-action="block-member"],[data-action="unblock-member"],[data-action="reset-member"]').forEach(function(b){b.disabled=true})}
}
function renderDrawer(){
 if(!S.drawer)return;
 if(S.drawer.kind==="video")videoDrawer();
 if(S.drawer.kind==="member")memberDrawer();
}
function parseSource(url){
 var u;try{u=new URL(url)}catch(_){throw Error("כתובת הסרטון אינה תקינה")}
 if(u.protocol!=="https:")throw Error("נדרש קישור HTTPS מאובטח");
 var host=u.hostname.toLowerCase(),id,provider;
 if(["youtube.com","www.youtube.com","m.youtube.com","www.youtube-nocookie.com","youtu.be","www.youtu.be"].includes(host)){
  provider="youtube";id=host.endsWith("youtu.be")?u.pathname.split("/")[1]:u.searchParams.get("v")||((u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)||[])[1]);
  if(!id||!/^[\w-]{11}$/.test(id))throw Error("קישור YouTube אינו מכיל מזהה סרטון תקין");
 }else if(host==="drive.google.com"){
  provider="google_drive";id=(u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)||[])[1];
  if(!id||!/^[\w-]{15,}$/.test(id))throw Error("יש להזין קישור לקובץ וידאו ב-Google Drive ולא לתיקייה");
 }else throw Error("אפשר להוסיף סרטוני YouTube וקובצי Google Drive בלבד");
 return {provider:provider,provider_asset_id:id,source_url:url};
}
function newSlug(){return "video-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7)}
async function saveVideo(form){
 var f=new FormData(form),v=vid(S.drawer.id),title=String(f.get("title_he")||"").trim();
 if(title.length<2||title.length>180)throw Error("יש להזין כותרת באורך 2–180 תווים");
 var source=parseSource(String(f.get("source_url")||"").trim());
 var obj={title_he:title,category:String(f.get("category")),description_he:String(f.get("description_he")||"").trim(),variant:String(f.get("variant")||"").trim(),status:String(f.get("status")),sort_order:Number(f.get("sort_order")||0),updated_at:new Date().toISOString(),...source};
 if(!Number.isInteger(obj.sort_order)||Math.abs(obj.sort_order)>1000000)throw Error("ערך סדר התצוגה אינו תקין");
 if(v){
  assert(await sb.from("training_videos").update(obj).eq("id",v.id).select("id").single());
 }else{
  obj.slug=newSlug();
  var saved=assert(await sb.from("training_videos").insert(obj).select("id").single());
  S.drawer.id=saved.id;
 }
}
async function syncVideoGrants(form){
 var id=S.drawer.id;if(!vid(id))throw Error("הסרטון לא נמצא");
 var f=new FormData(form),ranks=f.getAll("rank").map(String),groups=f.getAll("group").map(String);
 var priorRanks=S.rankGrants.filter(function(g){return g.video_id===id}).map(function(g){return g.rank_key});
 var priorGroups=S.groupGrants.filter(function(g){return g.video_id===id}).map(function(g){return g.group_id});
 var removeRanks=priorRanks.filter(function(x){return !ranks.includes(x)}),addRanks=ranks.filter(function(x){return !priorRanks.includes(x)});
 var removeGroups=priorGroups.filter(function(x){return !groups.includes(x)}),addGroups=groups.filter(function(x){return !priorGroups.includes(x)});
 var operations=[];
 removeRanks.forEach(function(r){operations.push(sb.from("training_video_rank_grants").delete().eq("video_id",id).eq("rank_key",r))});
 addRanks.forEach(function(r){operations.push(sb.from("training_video_rank_grants").insert({video_id:id,rank_key:r}))});
 removeGroups.forEach(function(g){operations.push(sb.from("training_video_group_grants").delete().eq("video_id",id).eq("group_id",g))});
 addGroups.forEach(function(g){operations.push(sb.from("training_video_group_grants").insert({video_id:id,group_id:g}))});
 // Report partial writes explicitly rather than showing a false success.
 var results=await Promise.allSettled(operations);
 var failures=results.filter(function(x){return x.status==="rejected"||(x.status==="fulfilled"&&x.value.error)});
 if(failures.length)throw Error("חלק מהשינויים לא נשמרו; רענן ובדוק הרשאות לפני ניסיון חוזר");
}
async function applyPersonal(form){
 var f=new FormData(form),videoId=String(f.get("video_id")||""),scope=String(f.get("scope")||""),decision=String(f.get("decision")||"");
 var match=scope.match(/^(profile|child):([0-9a-f-]{36})$/i);
 if(!match||!vid(videoId))throw Error("יש לבחור משתמש וסרטון");
 var type=match[1],id=match[2],p=member(S.drawer.id);
 if(type==="profile"&&id!==p.id)throw Error("החשבון שנבחר אינו תואם");
 if(type==="child"&&!ownerKids(p.id).some(function(c){return c.id===id}))throw Error("החניך אינו משויך לחשבון");
 var table=type==="child"?"training_video_child_grants":"training_video_profile_grants",key=type==="child"?"child_id":"profile_id";
 if(decision==="clear"){
  var del=sb.from(table).delete().eq("video_id",videoId);assert(await del.eq(key,id));return;
 }
 if(!["allow","deny"].includes(decision))throw Error("פעולה לא חוקית");
 var expires=String(f.get("expires_at")||"").trim(),date=expires?new Date(expires):null;
 if(date&&(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()))throw Error("תאריך התוקף חייב להיות בעתיד");
 var payload={video_id:videoId,decision:decision,expires_at:date?date.toISOString():null,changed_by:S.user.id,updated_at:new Date().toISOString()};
 payload[key]=id;
 assert(await sb.from(table).upsert(payload,{onConflict:"video_id,"+key}));
}
async function clearOverride(type,id,videoId){
 var table=type==="child"?"training_video_child_grants":"training_video_profile_grants";
 var key=type==="child"?"child_id":"profile_id";
 assert(await sb.from(table).delete().eq(key,id).eq("video_id",videoId));
}
async function confirmAction(title,detail,accept){
 return new Promise(function(resolve){
  var d=$("confirmDialog");$("confirmTitle").textContent=title;$("confirmDescription").textContent=detail;$("confirmAccept").textContent=accept||"אישור הפעולה";
  d.returnValue="";
  d.addEventListener("close",function onClose(){resolve(d.returnValue==="confirm")},{once:true});
  d.showModal();
 });
}
function quoteCsv(s){var v=String(s==null?"":s);if(/^[\s]*[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
function csv(name,head,rows){
 var body="\ufeff"+[head].concat(rows).map(function(r){return r.map(quoteCsv).join(",")}).join("\r\n");
 var blob=new Blob([body],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob);
 var a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1200);
}
function exportData(which){
 if(which==="videos")csv("ryokudo-training-videos.csv",["כותרת","קטגוריה","סטטוס","מקור","הרשאות","קישור"],S.videos.map(function(v){return [v.title_he,labelCat(v.category),v.status,v.provider,videoAccessSummary(v),v.source_url]}));
 if(which==="users")csv("ryokudo-training-users.csv",["שם חשבון","דואל","תפקיד","אישור","מספר חניכים","חסום"],S.profiles.map(function(p){return [pname(p),p.email,p.role,p.approval_status,ownerKids(p.id).length,isBlocked(p.id)?"כן":"לא"]}));
 if(which==="activity")csv("ryokudo-training-audit.csv",["זמן","פעולה","מבצע","טבלה"],S.audit.map(function(a){return [fmtTime(a.changed_at),eventName(a),pname(member(a.actor)),a.table_name]}));
 notify("קובץ CSV הוכן ליצוא",false);
}
function preserveSearchFocus(callback){
 var field=$("mainSearch");var start=field&&field.selectionStart;
 callback();render();field=$("mainSearch");
 if(field){field.focus();if(typeof start==="number")try{field.setSelectionRange(start,start)}catch(_){}}
}
document.addEventListener("click",async function(e){
 var nav=e.target.closest("[data-view]");if(nav){navigate(nav.dataset.view);return}
 var row=e.target.closest("[data-row]");var action=e.target.closest("[data-action]");
 if(!action&&row&&row.dataset.row==="video"){showDrawer("video",row.dataset.id,"details");return}
 if(!action&&row&&row.dataset.row==="member"){showDrawer("member",row.dataset.id);return}
 if(!action)return;
 var cmd=action.dataset.action,id=action.dataset.id;
 if(cmd==="add-video"){showDrawer("video",null);return}
 if(cmd==="go-permissions"){navigate("permissions");return}
 if(cmd==="go-members"){navigate("members");return}
 if(cmd==="go-activity"){navigate("activity");return}
 if(cmd==="open-video"){showDrawer("video",id,"details");return}
 if(cmd==="open-video-grants"){showDrawer("video",id,"grants");return}
 if(cmd==="open-member"){showDrawer("member",id);return}
 if(cmd==="drawer-tab"){S.drawer.tab=action.dataset.tab;renderDrawer();return}
 if(cmd==="page-next"||cmd==="page-back"){S.page+=(cmd==="page-next"?1:-1);render();return}
 if(cmd==="export-videos"){exportData("videos");return}
 if(cmd==="export-users"){exportData("users");return}
 if(cmd==="export-activity"){exportData("activity");return}
 if(cmd==="block-member"){
  if(id===S.user.id)return notify("אי אפשר לחסום את חשבון המנהל הראשי",true);
  if(!await confirmAction("חסימת גישה לחשבון","החשבון לא יוכל להיכנס לספריית הסרטונים עד לביטול החסימה. אין מחיקה של פרטי המשתמש.","חסום חשבון"))return;
  await mutate(async function(){assert(await sb.rpc("training_remove_profile_access",{p_profile_id:id}))},"הגישה לחשבון נחסמה");return;
 }
 if(cmd==="unblock-member"){
  await mutate(async function(){assert(await sb.rpc("training_unblock_profile_access",{p_profile_id:id}))},"חסימת החשבון בוטלה");return;
 }
 if(cmd==="reset-member"){
  if(id===S.user.id)return notify("אי אפשר לאפס את חשבון המנהל הראשי",true);
  if(!await confirmAction("איפוס כל ההרשאות","כל ההרשאות הפרטניות של החשבון ושל ילדיו יוסרו, וחסימת החשבון תבוטל. הרשאות חגורה וקבוצה ימשיכו לחול.","אפס הרשאות"))return;
  await mutate(async function(){assert(await sb.rpc("training_reset_profile_access",{p_profile_id:id}))},"הרשאות החשבון אופסו");return;
 }
 if(cmd==="clear-override"){
  var sc=action.dataset.scope,vi=action.dataset.video;
  if(!await confirmAction("הסרת החרגה אישית","ההרשאה או החסימה הפרטנית לסרטון תוסר. הרשאות אוטומטיות לפי דרגה וקבוצה יישארו בתוקף.","הסר החרגה"))return;
  await mutate(function(){return clearOverride(sc,id,vi)},"ההחרגה הוסרה");return;
 }
});
document.addEventListener("input",function(e){
 if(e.target.id==="mainSearch")preserveSearchFocus(function(){S.search=e.target.value;S.page=1});
});
document.addEventListener("change",function(e){
 if(e.target.id==="statusFilter"){S.status=e.target.value;S.page=1;render()}
 if(e.target.id==="categoryFilter"){S.category=e.target.value;S.page=1;render()}
 if(e.target.id==="activityFilter"){S.activityFilter=e.target.value;render()}
});
document.addEventListener("submit",async function(e){
 if(!["loginForm","videoForm","grantForm","personalGrantForm"].includes(e.target.id))return;
 e.preventDefault();var f=e.target;
 if(f.id==="loginForm"){
  var button=f.querySelector("button[type=submit]");button.disabled=true;
  try{assert(await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value}));await authorize()}catch(err){gate("ההתחברות נכשלה. בדוק חשבון, סיסמה והרשאות מנהל.",true);notify(err.message||"שגיאת התחברות",true)}
  finally{button.disabled=false}return;
 }
 if(!S.profile||S.profile.role!=="admin")return;
 if(f.id==="videoForm"){var existing=Boolean(S.drawer&&S.drawer.id);await mutate(function(){return saveVideo(f)},existing?"פרטי הסרטון עודכנו":"הסרטון נוסף לקטלוג");return}
 if(f.id==="grantForm"){await mutate(function(){return syncVideoGrants(f)},"הרשאות הדרגות והקבוצות עודכנו");return}
 if(f.id==="personalGrantForm"){await mutate(function(){return applyPersonal(f)},"ההרשאה האישית עודכנה");return}
});
$("drawerClose").addEventListener("click",closeDrawer);
$("drawerShade").addEventListener("click",closeDrawer);
$("menuToggle").addEventListener("click",function(){S.menu=!S.menu;$("sidebar").classList.toggle("open",S.menu);$("mobileShade").classList.toggle("show",S.menu)});
$("mobileShade").addEventListener("click",clearMobile);
$("topAddBtn").addEventListener("click",function(){showDrawer("video",null)});
$("refreshBtn").addEventListener("click",function(){mutate(async function(){},"הנתונים עודכנו")});
$("logoutBtn").addEventListener("click",async function(){try{assert(await sb.auth.signOut());S.user=null;S.profile=null;closeDrawer();gate("התנתקת מהמערכת.",true)}catch(err){notify("ההתנתקות נכשלה",true)}});
document.addEventListener("keydown",function(e){
 if(e.key==="Escape"&&S.drawer&&!$("confirmDialog").open)closeDrawer();
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"&&S.profile){e.preventDefault();var f=$("mainSearch");if(f)f.focus()}
});
authorize();
})();