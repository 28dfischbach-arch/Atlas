/* Atlas Mail */
const MAIL_KEY='atlas_mail';
let currentFolder='inbox';
let openId=null;
let composeMode='new'; // 'new','reply','forward'

const SEED=[
  {id:1,folder:'inbox',from:'Atlas Team',email:'team@getatlas.app',subject:'Welcome to Atlas Mail',preview:'Your inbox, reimagined inside Atlas.',body:'Hi there,\n\nWelcome to Atlas Mail — your full email client built right into your workspace.\n\nCompose messages, reply, forward, star important threads, and organize everything across folders — all stored locally on your device.\n\nGet started by hitting the Compose button, or explore your inbox.\n\nThe Atlas Team',date:Date.now()-86400000*3,read:false,starred:false},
  {id:2,folder:'inbox',from:'Sarah Johnson',email:'sarah.johnson@workco.com',subject:'Q3 Project Update — Action Required',preview:'Hi, wanted to share the latest status on the Q3 roadmap and flag a few blockers.',body:'Hi,\n\nWanted to share the latest on the Q3 roadmap before our sync on Thursday.\n\nKey updates:\n• Feature A is on track — staging deploy tomorrow\n• Feature B is blocked on design sign-off (can you review?)\n• The analytics dashboard is 80% done, targeting next Friday\n\nPlease review the design file and leave comments by Wednesday EOD.\n\nThanks,\nSarah',date:Date.now()-86400000*1,read:false,starred:true},
  {id:3,folder:'inbox',from:'Alex Chen',email:'alex@devteam.io',subject:'PR Review: Auth module refactor',preview:"Left some comments on the PR — mostly minor, one thing needs your attention.",body:"Hey,\n\nI reviewed the auth module refactor PR. Great work overall — the code is much cleaner.\n\nI left a few comments but one thing needs your attention: the session expiry logic in auth.middleware.ts (line 142) doesn't handle the edge case where the refresh token has already been revoked. Could you add a check there?\n\nEverything else looks good to me. Let me know when it's ready for re-review.\n\nAlex",date:Date.now()-3600000*5,read:true,starred:false},
  {id:4,folder:'inbox',from:'Notion',email:'notify@notion.so',subject:'Weekly digest: 3 pages updated',preview:'Here\'s what changed in your Notion workspace this week.',body:'Here\'s your weekly Notion digest:\n\n📄 Product Roadmap — edited by you (2 days ago)\n📄 Meeting Notes — edited by Sarah (yesterday)\n📄 Design System — edited by Marcus (3 days ago)\n\nOpen Notion →\n\n—\nNotion Notifications',date:Date.now()-86400000*2,read:true,starred:false},
  {id:5,folder:'inbox',from:'Marcus Lee',email:'marcus@design.studio',subject:'Logo concepts ready for review',preview:'Attached the three logo directions we discussed. Let me know your thoughts!',body:'Hey,\n\nThe three logo concepts are ready! Here\'s a summary of each direction:\n\n1. Wordmark — Clean, geometric type treatment. Very versatile.\n2. Icon + Wordmark — Combines the "A" mark with the Atlas name.\n3. Symbol only — Minimal, works great as favicon/app icon.\n\nI\'d recommend Option 2 for the primary brand mark and Option 3 for icon use.\n\nLet me know your thoughts and I can move to refinements by Friday.\n\nMarcus',date:Date.now()-3600000*2,read:false,starred:false},
  {id:6,folder:'sent',from:'Me',email:'me@atlas.app',subject:'Re: Q3 Project Update',preview:'Thanks Sarah, will review the design file today.',body:'Hi Sarah,\n\nThanks for the update! I\'ll review the design file today and have comments to you by Wednesday.\n\nFor the analytics dashboard — can we get a demo in the Thursday sync?\n\nThanks,',date:Date.now()-3600000*23,read:true,starred:false},
  {id:7,folder:'drafts',from:'Me',email:'me@atlas.app',subject:'Follow up on proposal',preview:'Hi David, just following up on the proposal I sent last week...',body:'Hi David,\n\nJust following up on the proposal I sent last week. Happy to jump on a call to walk through any questions.\n\nLet me know what works for you.',date:Date.now()-86400000,read:true,starred:false},
  {id:8,folder:'inbox',from:'GitHub',email:'noreply@github.com',subject:'[atlas-workspace] New comment on issue #42',preview:'A new comment was posted on your issue: "Authentication bug on mobile"',body:'A new comment was posted on issue #42 in atlas-workspace/core.\n\n---\n@dev-bot: I can reproduce this on iOS 17. The issue appears when the token refresh happens during backgrounding. Attaching logs.\n---\n\nView issue on GitHub →',date:Date.now()-3600000*8,read:true,starred:false},
];

function getMail(){
  try{
    const d=JSON.parse(localStorage.getItem(MAIL_KEY)||'null');
    if(d&&Array.isArray(d.messages))return d;
  }catch(e){}
  const initial={messages:SEED.slice(),nextId:SEED.length+1};
  saveMail(initial);
  return initial;
}
function saveMail(d){localStorage.setItem(MAIL_KEY,JSON.stringify(d));}

function getMessages(folder){
  const d=getMail();
  if(folder==='starred')return d.messages.filter(m=>m.starred&&m.folder!=='trash');
  return d.messages.filter(m=>m.folder===folder);
}

function setFolder(folder){
  currentFolder=folder;
  openId=null;
  document.querySelectorAll('.mail-folder').forEach(b=>b.classList.toggle('active',b.dataset.folder===folder));
  document.getElementById('folderTitle').textContent=
    {inbox:'Inbox',starred:'Starred',sent:'Sent',drafts:'Drafts',trash:'Trash'}[folder]||folder;
  renderList();
  showEmpty();
  updateCounts();
}

function renderList(){
  const list=document.getElementById('mailList');
  const msgs=getMessages(currentFolder);
  if(!msgs.length){
    list.innerHTML='<div class="mail-no-messages"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1" opacity=".25" width="40" height="40"><rect x="4" y="7" width="32" height="26" rx="3"/><path d="M4 13l16 10 16-10"/></svg><div>No messages</div></div>';
    return;
  }
  list.innerHTML='';
  msgs.slice().sort((a,b)=>b.date-a.date).forEach(m=>{
    const row=document.createElement('div');
    row.className='mail-row'+(m.read?'':' unread')+(m.id===openId?' active':'');
    row.dataset.id=m.id;
    row.innerHTML=`
      <div class="mail-row-top">
        ${!m.read?'<div class="mail-unread-dot"></div>':'<div style="width:7px"></div>'}
        <div class="mr-from">${esc(m.from)}</div>
        <div class="mr-date">${relDate(m.date)}</div>
      </div>
      <div class="mr-subject">${esc(m.subject)}</div>
      <div class="mr-preview">${esc(m.preview||m.body.slice(0,60))}</div>
      <div class="mr-star${m.starred?' starred':''}">★</div>`;
    row.querySelector('.mr-star').addEventListener('click',(e)=>{e.stopPropagation();toggleStar(m.id);});
    row.addEventListener('click',()=>openMessage(m.id));
    list.appendChild(row);
  });
}

function openMessage(id){
  const d=getMail();
  const m=d.messages.find(x=>x.id===id);
  if(!m)return;
  openId=id;
  if(!m.read){m.read=true;saveMail(d);updateCounts();}
  document.getElementById('mailEmptyState').style.display='none';
  document.getElementById('mailMessage').style.display='';
  document.getElementById('msgSubject').textContent=m.subject;
  document.getElementById('msgAvatar').textContent=(m.from||'?').charAt(0).toUpperCase();
  document.getElementById('msgFrom').textContent=m.from+(m.email?` <${m.email}>`:'');
  document.getElementById('msgDate').textContent=fullDate(m.date);
  document.getElementById('msgBody').textContent=m.body;
  const starIcon=document.getElementById('starIcon');
  starIcon.style.fill=m.starred?'#f59e0b':'none';
  document.querySelectorAll('.mail-row').forEach(r=>r.classList.toggle('active',parseInt(r.dataset.id)===id));
}

function showEmpty(){
  document.getElementById('mailEmptyState').style.display='';
  document.getElementById('mailMessage').style.display='none';
  openId=null;
}

window.archiveOpen=function(){
  if(!openId)return;
  const d=getMail();
  const m=d.messages.find(x=>x.id===openId);
  if(m){m.folder='trash';}
  saveMail(d);openId=null;renderList();showEmpty();updateCounts();
};
window.starOpen=function(){if(openId)toggleStar(openId);};
window.deleteOpen=function(){
  if(!openId)return;
  if(!confirm('Permanently delete this message?'))return;
  const d=getMail();
  d.messages=d.messages.filter(x=>x.id!==openId);
  saveMail(d);openId=null;renderList();showEmpty();updateCounts();
};

function toggleStar(id){
  const d=getMail();
  const m=d.messages.find(x=>x.id===id);
  if(m){m.starred=!m.starred;}
  saveMail(d);
  if(openId===id){const si=document.getElementById('starIcon');si.style.fill=m.starred?'#f59e0b':'none';}
  renderList();updateCounts();
}

window.markAllRead=function(){
  const d=getMail();
  getMessages(currentFolder).forEach(m=>{const x=d.messages.find(x=>x.id===m.id);if(x)x.read=true;});
  saveMail(d);renderList();updateCounts();
};
window.emptyFolder=function(){
  if(!confirm('Delete all messages in this folder?'))return;
  const d=getMail();
  d.messages=d.messages.filter(m=>{
    if(currentFolder==='starred')return !(m.starred&&m.folder!=='trash');
    return m.folder!==currentFolder;
  });
  saveMail(d);openId=null;renderList();showEmpty();updateCounts();
};

function updateCounts(){
  const d=getMail();
  const unreadInbox=d.messages.filter(m=>m.folder==='inbox'&&!m.read).length;
  const el=document.getElementById('cnt-inbox');
  if(el){el.textContent=unreadInbox||'';el.style.display=unreadInbox?'':'none';}
  const starred=d.messages.filter(m=>m.starred&&m.folder!=='trash').length;
  const es=document.getElementById('cnt-starred');
  if(es){es.textContent=starred||'';es.style.display=starred?'':'none';}
  const drafts=d.messages.filter(m=>m.folder==='drafts').length;
  const ed=document.getElementById('cnt-drafts');
  if(ed){ed.textContent=drafts||'';ed.style.display=drafts?'':'none';}
  // Notify parent
  if(unreadInbox>0){
    try{parent.postMessage({type:'atlas-notify',app:'mail',text:unreadInbox+' unread message'+(unreadInbox>1?'s':'')+' in your inbox'},'*');}catch(e){}
  }
}

// Compose
let replyToMsg=null;
window.openCompose=function(){
  replyToMsg=null;composeMode='new';
  document.getElementById('composeTitleLabel').textContent='New Message';
  document.getElementById('composeTo').value='';
  document.getElementById('composeSubject').value='';
  document.getElementById('composeBody').value='';
  document.getElementById('composeOverlay').style.display='';
  setTimeout(()=>document.getElementById('composeTo').focus(),50);
};
window.replyOpen=function(){
  if(!openId)return;
  const d=getMail();const m=d.messages.find(x=>x.id===openId);if(!m)return;
  replyToMsg=m;composeMode='reply';
  document.getElementById('composeTitleLabel').textContent='Reply';
  document.getElementById('composeTo').value=m.email||m.from;
  document.getElementById('composeSubject').value=(m.subject.startsWith('Re:')?'':'Re: ')+m.subject;
  document.getElementById('composeBody').value='\n\n---\nOn '+fullDate(m.date)+', '+m.from+' wrote:\n'+m.body;
  document.getElementById('composeOverlay').style.display='';
  setTimeout(()=>document.getElementById('composeBody').focus(),50);
};
window.forwardOpen=function(){
  if(!openId)return;
  const d=getMail();const m=d.messages.find(x=>x.id===openId);if(!m)return;
  replyToMsg=m;composeMode='forward';
  document.getElementById('composeTitleLabel').textContent='Forward';
  document.getElementById('composeTo').value='';
  document.getElementById('composeSubject').value=(m.subject.startsWith('Fwd:')?'':'Fwd: ')+m.subject;
  document.getElementById('composeBody').value='\n\n---\nForwarded message from '+m.from+':\n'+m.body;
  document.getElementById('composeOverlay').style.display='';
  setTimeout(()=>document.getElementById('composeTo').focus(),50);
};
window.closeCompose=function(){document.getElementById('composeOverlay').style.display='none';};
window.sendMessage=function(){
  const to=document.getElementById('composeTo').value.trim();
  const subj=document.getElementById('composeSubject').value.trim();
  const body=document.getElementById('composeBody').value;
  if(!to||!subj){alert('Please fill in To and Subject.');return;}
  const d=getMail();
  d.messages.push({
    id:d.nextId++,folder:'sent',from:'Me',email:'me@atlas.app',
    subject:subj,preview:body.slice(0,80),body,date:Date.now(),read:true,starred:false
  });
  // Remove draft if replying from draft
  saveMail(d);
  closeCompose();
  if(currentFolder==='sent')renderList();
  updateCounts();
  showToast('Message sent!');
};
window.saveDraft=function(){
  const subj=document.getElementById('composeSubject').value.trim()||'(No subject)';
  const body=document.getElementById('composeBody').value;
  const d=getMail();
  d.messages.push({
    id:d.nextId++,folder:'drafts',from:'Me',email:'me@atlas.app',
    subject:subj,preview:body.slice(0,80),body,date:Date.now(),read:true,starred:false
  });
  saveMail(d);closeCompose();
  if(currentFolder==='drafts')renderList();
  updateCounts();showToast('Draft saved');
};

function showToast(msg){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:999;';
  t.textContent=msg;document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity 0.3s';setTimeout(()=>t.remove(),300);},2500);
}

function relDate(ts){
  const d=new Date(ts),now=new Date();
  if(d.toDateString()===now.toDateString()){
    return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  }
  const days=Math.floor((now-d)/86400000);
  if(days<7)return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return (d.getMonth()+1)+'/'+(d.getDate());
}
function fullDate(ts){
  const d=new Date(ts);
  return d.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function esc(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

// Init
renderList();updateCounts();
