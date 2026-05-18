(function(){
'use strict';

const PKEY='atlas_profile', NKEY='atlas_notifs', UKEY='atlas_users';

function getP(){try{return JSON.parse(localStorage.getItem(PKEY)||'null');}catch(e){return null;}}
function setP(p){localStorage.setItem(PKEY,JSON.stringify(p));}
function clrP(){localStorage.removeItem(PKEY);}
function getN(){try{return JSON.parse(localStorage.getItem(NKEY)||'[]');}catch(e){return[];}}
function setN(a){localStorage.setItem(NKEY,JSON.stringify(a.slice(0,50)));}
function getU(){try{return JSON.parse(localStorage.getItem(UKEY)||'{}');}catch(e){return {};}}
function setU(u){localStorage.setItem(UKEY,JSON.stringify(u));}
function hash(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);}return String(h>>>0);}

const APPS={
  dashboard:{name:'Dashboard',src:'apps/dashboard/index.html'},
  mail:{name:'Mail',src:'apps/mail/index.html'},
  drive:{name:'Drive',src:'apps/drive/index.html'},
  chat:{name:'Chat',src:'apps/chat/index.html'},
  calendar:{name:'Calendar',src:'apps/calendar/index.html'},
  stck:{name:'STCK',src:'apps/stck/index.html'},
  sitebuilder:{name:'SiteBuilder',src:'apps/sitebuilder/index.html'},
  splitter:{name:'Splitter',src:'apps/splitter/index.html'},
  editor:{name:'Editor',src:'apps/editor/index.html'},
  store:{name:'Store',src:'apps/store/index.html'},
  settings:{name:'Settings',src:'apps/settings/index.html'},
};

// ─── Auth tab ──────────────────────────────────────────
window.authTab = function(which){
  document.querySelectorAll('.auth-tab').forEach((t,i)=>t.classList.toggle('active',i===(which==='signin'?0:1)));
  document.getElementById('pane-signin').style.display = which==='signin'?'':'none';
  document.getElementById('pane-signup').style.display = which==='signup'?'':'none';
  document.getElementById('si-err').textContent='';
  document.getElementById('su-err').textContent='';
};

window.doSignIn = function(){
  const email=document.getElementById('si-email').value.trim().toLowerCase();
  const pass=document.getElementById('si-pass').value;
  const err=document.getElementById('si-err');
  err.textContent='';
  if(!email||!pass){err.textContent='Please fill in all fields.';return;}
  const users=getU();
  const u=users[email];
  if(!u){err.textContent='No account found for that email.';return;}
  if(u.pass!==hash(pass)){err.textContent='Incorrect password.';return;}
  setP({name:u.name,email,createdAt:u.createdAt,payFrequency:u.payFrequency,hourlyRate:u.hourlyRate});
  bootShell();
};

window.doSignUp = function(){
  const name=document.getElementById('su-name').value.trim();
  const email=document.getElementById('su-email').value.trim().toLowerCase();
  const pass=document.getElementById('su-pass').value;
  const freq=document.getElementById('su-freq').value;
  const rate=parseFloat(document.getElementById('su-rate').value)||0;
  const err=document.getElementById('su-err');
  err.textContent='';
  if(!name){err.textContent='Enter your name.';return;}
  if(!email||!email.includes('@')){err.textContent='Enter a valid email.';return;}
  if(!pass||pass.length<6){err.textContent='Password must be at least 6 characters.';return;}
  const users=getU();
  if(users[email]){err.textContent='An account with this email already exists.';return;}
  users[email]={name,pass:hash(pass),createdAt:Date.now(),payFrequency:freq,hourlyRate:rate};
  setU(users);
  setP({name,email,createdAt:Date.now(),payFrequency:freq,hourlyRate:rate});
  bootShell();
};

window.doSignOut = function(){
  clrP();
  document.getElementById('shell').style.display='none';
  document.getElementById('auth').style.removeProperty('display');
  closeAllPops();
};

// ─── Shell boot ────────────────────────────────────────
function bootShell(){
  document.getElementById('auth').style.display='none';
  const shell=document.getElementById('shell');
  shell.style.display='flex';
  refreshAccount();
  refreshBell();
  openApp('dashboard');
  tickClock();
  clearInterval(window._clkT);
  window._clkT=setInterval(tickClock,30000);
}

function refreshAccount(){
  const p=getP();
  if(!p) return;
  const letter=(p.name||'A').charAt(0).toUpperCase();
  const el=document.getElementById('avLetter');if(el)el.textContent=letter;
  const pa=document.getElementById('popAv');if(pa)pa.textContent=letter;
  const pn=document.getElementById('popName');if(pn)pn.textContent=p.name||'User';
  const pe=document.getElementById('popEmail');if(pe)pe.textContent=p.email||'';
}

function refreshBell(){
  const n=getN();
  const dot=document.getElementById('bellDot');
  if(dot) dot.style.display=n.length?'block':'none';
}

function tickClock(){
  const el=document.getElementById('tbClock');
  if(!el) return;
  const d=new Date();
  const h=d.getHours().toString().padStart(2,'0');
  const m=d.getMinutes().toString().padStart(2,'0');
  el.textContent=h+':'+m;
}

// ─── App routing ───────────────────────────────────────
let currentApp='';
window.openApp = function(key){
  const app=APPS[key];
  if(!app) return;
  currentApp=key;
  const frame=document.getElementById('appFrame');
  if(frame) frame.src=app.src;
  const crumb=document.getElementById('crumbApp');
  if(crumb) crumb.textContent=app.name;
  document.querySelectorAll('.sb-item[data-app]').forEach(b=>b.classList.toggle('active',b.dataset.app===key));
  closeAllPops();
};

// ─── Sidebar ───────────────────────────────────────────
window.toggleSidebar = function(){
  const sb=document.getElementById('sidebar');
  if(sb) sb.style.display=sb.style.display==='none'?'':'none';
};

// ─── Popovers ──────────────────────────────────────────
window.closeAllPops = function(){
  document.querySelectorAll('.pop').forEach(p=>p.classList.remove('open'));
};
window.toggleAccountPop = function(){
  const p=document.getElementById('accountPop');
  const n=document.getElementById('notifPop');
  if(n) n.classList.remove('open');
  if(p) p.classList.toggle('open');
};
window.toggleNotifPop = function(){
  const p=document.getElementById('notifPop');
  const a=document.getElementById('accountPop');
  if(a) a.classList.remove('open');
  if(p) p.classList.toggle('open');
  if(p&&p.classList.contains('open')) renderNotifs();
};
function renderNotifs(){
  const n=getN();
  const list=document.getElementById('notifList');
  if(!list) return;
  list.innerHTML=n.length
    ? n.map(x=>'<div style="padding:10px 14px;border-bottom:1px solid #f0f0f2;font-size:12.5px;color:#4b4b53">'+x.text+'</div>').join('')
    : '<div class="notif-empty">No notifications</div>';
}
window.clearNotifs = function(){
  setN([]);
  const dot=document.getElementById('bellDot');if(dot)dot.style.display='none';
  renderNotifs();
};
document.addEventListener('click', function(e){
  if(!e.target.closest('.pop')&&!e.target.closest('.tb-avatar-btn')&&!e.target.closest('.tb-bell')){
    closeAllPops();
  }
});

// ─── Command palette ───────────────────────────────────
window.openPalette = function(){
  const pal=document.getElementById('palette');
  if(pal){pal.classList.add('open');const inp=document.getElementById('palInput');if(inp){inp.value='';inp.focus();filterPalette();}}
};
window.closePalette = function(e){
  if(e&&e.target.id!=='palette') return;
  document.getElementById('palette').classList.remove('open');
};
window.filterPalette = function(){
  const q=(document.getElementById('palInput')||{}).value.toLowerCase();
  const list=document.getElementById('palItems');
  if(!list) return;
  list.innerHTML=Object.entries(APPS)
    .filter(([k,v])=>!q||k.includes(q)||v.name.toLowerCase().includes(q))
    .map(([k,v],i)=>'<button class="pal-item'+(i===0?' sel':'')+'" onclick="openApp(\''+k+'\');document.getElementById(\'palette\').classList.remove(\'open\')">'+v.name+'</button>')
    .join('');
};
window.palKey = function(e){
  if(e.key==='Escape'){document.getElementById('palette').classList.remove('open');}
  if(e.key==='Enter'){const s=document.querySelector('.pal-item.sel');if(s)s.click();}
};
document.addEventListener('keydown',function(e){
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openPalette();}
});

// ─── Advisor toggle ────────────────────────────────────
let advOpen=false;
window.toggleAdvisor = function(){
  advOpen=!advOpen;
  document.getElementById('advPanel').classList.toggle('open',advOpen);
  document.getElementById('advOverlay').classList.toggle('open',advOpen);
  document.getElementById('advisorBtn').classList.toggle('open',advOpen);
  if(advOpen){const inp=document.getElementById('advInput');if(inp)inp.focus();}
};

// ─── Toast ─────────────────────────────────────────────
window.showToast = function(msg,dur){
  const stack=document.getElementById('toastStack');
  if(!stack) return;
  const t=document.createElement('div');
  t.className='toast';t.textContent=msg;
  stack.appendChild(t);
  setTimeout(()=>t.remove(),(dur||2500));
};

// ─── Cross-frame messaging ─────────────────────────────
window.addEventListener('message',function(e){
  if(!e.data||typeof e.data!=='object') return;
  const{type,app}=e.data;
  if(type==='atlas-open'&&app) openApp(app);
  if(type==='atlas-signout') doSignOut();
  if(type==='atlas-profile-updated') refreshAccount();
});

// ─── Notification engine ───────────────────────────────
function startReminders(){
  setInterval(function(){
    try{
      const evts=JSON.parse(localStorage.getItem('superapp_calendar_events')||'[]');
      const today=new Date();
      const todayKey=today.getDate()+'-'+today.getMonth()+'-'+today.getFullYear();
      const todayEvts=evts.filter(e=>e.day===today.getDate()&&e.month===today.getMonth()&&e.year===today.getFullYear());
      if(todayEvts.length){
        const notifs=getN();
        const key='day-'+todayKey;
        if(!notifs.find(n=>n.id===key)){
          notifs.unshift({id:key,text:'You have '+todayEvts.length+' event'+(todayEvts.length>1?'s':'')+' today.',ts:Date.now()});
          setN(notifs);
          refreshBell();
        }
      }
    }catch(e){}
  },60000);
}

// ─── Init ──────────────────────────────────────────────
function init(){
  const p=getP();
  if(p){
    bootShell();
  } else {
    document.getElementById('auth').style.removeProperty('display');
    document.getElementById('shell').style.display='none';
  }
  startReminders();
}

init();
})();