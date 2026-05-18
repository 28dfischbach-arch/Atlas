(function(){
'use strict';

function getProfile(){ try{return JSON.parse(localStorage.getItem('atlas_profile')||'null');}catch(e){return null;} }
function getNotifs(){ try{return JSON.parse(localStorage.getItem('atlas_notifs')||'[]');}catch(e){return [];} }
function getLS(k, fb){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }catch(e){ return fb; } }
function timeAgo(t){
  const s=Math.floor((Date.now()-t)/1000);
  if(s<60)return 'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
function fmtMoney(n){ return '$'+(n||0).toLocaleString(undefined,{maximumFractionDigits:0}); }
function escHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

const APP_NAMES={dashboard:'Dashboard',mail:'Mail',chat:'Chat',calendar:'Calendar',stck:'STCK',store:'Store',splitter:'Splitter',editor:'Editor'};

function getStckState(){
  const profile = getProfile();
  if(!profile||!profile.email) return null;
  try{ const key='stck_'+btoa(profile.email).replace(/=/g,''); return getLS(key,null); }catch(e){ return null; }
}

function estimateWeekSpend(){
  const s=getStckState();
  const txs=(s&&(s.transactions||s.expenses))||[];
  const oneWeek=Date.now()-7*24*60*60*1000;
  let total=0;
  for(const t of txs){
    const ts=new Date(t.date||t.t||0).getTime();
    if(ts>oneWeek){
      const amt=Number(t.amount)||0;
      if(amt<0) total+=Math.abs(amt);
      else if(t.type==='expense') total+=amt;
    }
  }
  return total;
}

function getChatUnread(){
  const profile=getProfile();
  if(!profile||!profile.email) return [];
  const lastSeen=Number(localStorage.getItem('atlas_chat_lastseen')||0);
  const prefix='cipher_'+profile.email+'_m_';
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k||!k.startsWith(prefix)) continue;
    const msgs=getLS(k,[]);
    if(!Array.isArray(msgs)) continue;
    let unread=0;
    const room=k.slice(prefix.length);
    for(const m of msgs){ if((m.type==='peer'||m.type==='remote')&&(m.ts||0)>lastSeen) unread++; }
    if(unread>0) out.push({room,unread});
  }
  return out;
}

function getTodayEvents(){
  const events=getLS('superapp_calendar_events',[]);
  if(!Array.isArray(events)) return [];
  const now=new Date();
  const m=now.getMonth(),d=now.getDate(),y=now.getFullYear();
  return events.filter(e=>Number(e.month)===m&&Number(e.day)===d&&Number(e.year)===y)
    .sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
}

function getMailUnread(){
  return getLS('atlas_mail_unread',[]);
}

function getLowStock(){
  const products=getLS('store_products',[]);
  if(!Array.isArray(products)) return [];
  return products.filter(p=>Number(p.stock)<=10);
}

function getRecentSplits(){
  const candidates=['splitter_projects','splitter_history','spliterProjects','spliter_recent'];
  for(const k of candidates){
    const v=getLS(k,null);
    if(Array.isArray(v)&&v.length) return v.slice(0,5);
  }
  return [];
}

function renderCard(bodyId,badgeId,items,renderItem,emptyMsg){
  const body=document.getElementById(bodyId);
  const badge=document.getElementById(badgeId);
  if(!body) return;
  if(badge){ badge.textContent=items.length; badge.style.display=items.length?'':'none'; }
  body.innerHTML=items.length
    ? items.slice(0,4).map(renderItem).join('')
    : '<div class="dc-empty">'+escHtml(emptyMsg)+'</div>';
}

function init(){
  const p=getProfile()||{};
  const h=new Date().getHours();
  const greet=h<5?'Burning the midnight oil':h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Good night';
  const g=id=>document.getElementById(id);
  if(g('greet')) g('greet').textContent=greet+',';
  if(g('hero-name')) g('hero-name').textContent=(p.name||'Welcome').split(' ')[0];
  if(g('hero-date')) g('hero-date').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  if(g('stat-spent')) g('stat-spent').textContent=fmtMoney(estimateWeekSpend());

  // Glance
  if(g('glance-email')) g('glance-email').textContent=p.email||'—';
  if(g('glance-since')) g('glance-since').textContent=p.createdAt?new Date(p.createdAt).toLocaleDateString():'—';
  const fmap={bimonthly:'1st & 15th',biweekly:'Every 2 weeks',weekly:'Every week',monthly:'Once a month'};
  if(g('glance-pay')) g('glance-pay').textContent=fmap[p.payFrequency]||'—';
  if(g('glance-rate')) g('glance-rate').textContent=p.hourlyRate?'$'+Number(p.hourlyRate).toFixed(2)+'/hr':'—';

  // Activity
  const n=getNotifs();
  const act=g('activity');
  if(act&&n.length){
    act.innerHTML='';
    n.slice(0,8).forEach(item=>{
      const r=document.createElement('div');
      r.className='act-row';
      r.innerHTML='<div class="ar-app">'+escHtml(APP_NAMES[item.app]||item.app)+'</div><div class="ar-text"></div><div class="ar-time">'+escHtml(timeAgo(item.t))+'</div>';
      r.querySelector('.ar-text').textContent=item.text;
      r.onclick=()=>parent.postMessage({type:'atlas-open',app:item.app},'*');
      act.appendChild(r);
    });
  }

  renderCard('dc-chat-body','dc-chat-badge',getChatUnread(),
    item=>'<div class="dc-row"><span class="dc-line">'+escHtml('Room '+item.room)+'</span><span class="dc-meta">'+item.unread+' new</span></div>',
    'No new messages');

  renderCard('dc-cal-body','dc-cal-badge',getTodayEvents(),
    e=>'<div class="dc-row"><span class="dc-dot" style="background:'+escHtml(e.color||'#0071e3')+'"></span><span class="dc-line">'+escHtml(e.title)+'</span><span class="dc-meta">'+escHtml(e.time||'')+'</span></div>',
    'Nothing scheduled today');

  renderCard('dc-mail-body','dc-mail-badge',getMailUnread(),
    m=>'<div class="dc-row"><span class="dc-line">'+escHtml(m.from||'Unknown')+'</span><span class="dc-meta">'+escHtml(m.subject||'')+'</span></div>',
    'Inbox is clear');

  renderCard('dc-stock-body','dc-stock-badge',getLowStock(),
    p=>'<div class="dc-row"><span class="dc-line">'+escHtml(p.name||'Product')+'</span><span class="dc-meta '+(Number(p.stock)===0?'dc-bad':'')+'">'+( Number(p.stock)===0?'Out':p.stock+' left')+'</span></div>',
    'Inventory looks healthy');

  renderCard('dc-split-body','dc-split-badge',getRecentSplits(),
    p=>'<div class="dc-row"><span class="dc-line">'+escHtml(p.name||p.title||'Project')+'</span><span class="dc-meta">'+(p.t?timeAgo(p.t):'')+'</span></div>',
    'No recent projects');

  document.querySelectorAll('.data-card').forEach(c=>{
    c.style.cursor='pointer';
    c.addEventListener('click',()=>{
      const app=c.dataset.open;
      if(app==='chat') localStorage.setItem('atlas_chat_lastseen',Date.now());
      parent.postMessage({type:'atlas-open',app},'*');
    });
  });
  document.querySelectorAll('.app-card').forEach(c=>{
    c.addEventListener('click',()=>{ parent.postMessage({type:'atlas-open',app:c.dataset.app},'*'); });
  });
}

init();
})();