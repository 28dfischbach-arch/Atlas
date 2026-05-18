/* Atlas Drive — Universal search across all Atlas data */
let activeFilter='all';
let debounceTimer=null;

const SOURCES=[
  {
    type:'file',label:'Files',app:'editor',
    load:()=>{
      try{
        const raw=localStorage.getItem('nc_files');
        const files=JSON.parse(raw||'[]');
        return files.map(f=>({
          id:'file_'+f.id,type:'file',app:'editor',
          title:f.name||'Untitled',
          preview:(f.content||'').trim().slice(0,100)||'Empty file',
          raw:f
        }));
      }catch(e){return[];}
    }
  },
  {
    type:'email',label:'Emails',app:'mail',
    load:()=>{
      try{
        const raw=localStorage.getItem('atlas_mail');
        const data=JSON.parse(raw||'null');
        const msgs=(data&&data.messages)||[];
        return msgs.filter(m=>m.folder!=='trash').map(m=>({
          id:'email_'+m.id,type:'email',app:'mail',
          title:m.subject||'(no subject)',
          preview:'From '+m.from+' — '+(m.preview||m.body||'').slice(0,80),
          raw:m
        }));
      }catch(e){return[];}
    }
  },
  {
    type:'event',label:'Events',app:'calendar',
    load:()=>{
      try{
        const raw=localStorage.getItem('superapp_calendar_events');
        const events=JSON.parse(raw||'[]');
        return events.map(ev=>({
          id:'event_'+ev.id,type:'event',app:'calendar',
          title:ev.title||'Untitled event',
          preview:(ev.category||'Event')+' · '+(ev.time||'All day')+(ev.day?(' · Day '+ev.day):''),
          raw:ev
        }));
      }catch(e){return[];}
    }
  },
  {
    type:'note',label:'Notes',app:'editor',
    load:()=>{
      try{
        // Also look for any notes saved in chat
        const raw=localStorage.getItem('atlas_chat_notes')||localStorage.getItem('notecode_notes');
        if(!raw)return[];
        const notes=JSON.parse(raw||'[]');
        return (Array.isArray(notes)?notes:[]).map((n,i)=>({
          id:'note_'+i,type:'note',app:'editor',
          title:n.title||'Note '+(i+1),
          preview:(n.content||'').slice(0,100),
          raw:n
        }));
      }catch(e){return[];}
    }
  }
];

function loadAll(){
  const all=[];
  SOURCES.forEach(s=>{
    try{all.push(...s.load());}catch(e){}
  });
  return all;
}

function search(query,filter){
  const q=(query||'').toLowerCase().trim();
  let items=loadAll();
  if(filter&&filter!=='all'){items=items.filter(i=>i.type===filter);}
  if(q){
    items=items.filter(i=>
      i.title.toLowerCase().includes(q)||
      i.preview.toLowerCase().includes(q)
    );
  }
  return items;
}

function updateStats(){
  const all=loadAll();
  document.getElementById('statFiles').textContent=all.filter(i=>i.type==='file').length;
  document.getElementById('statEmails').textContent=all.filter(i=>i.type==='email').length;
  document.getElementById('statEvents').textContent=all.filter(i=>i.type==='event').length;
  document.getElementById('statNotes').textContent=all.filter(i=>i.type==='note').length;
}

function typeIcon(type){
  const icons={
    file:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z"/><path d="M9 2v4h4"/></svg>',
    email:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2 6l6 4 6-4"/></svg>',
    event:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 7h12M5 2v2M11 2v2"/></svg>',
    note:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h6"/></svg>'
  };
  return icons[type]||icons.file;
}

function render(results){
  const container=document.getElementById('driveResults');
  const empty=document.getElementById('driveEmpty');
  const stats=document.getElementById('driveStats');
  const q=document.getElementById('searchInput').value.trim();

  if(!q&&activeFilter==='all'){
    container.style.display='none';empty.style.display='none';
    stats.style.display='grid';return;
  }
  stats.style.display='none';

  if(!results.length){
    container.style.display='none';empty.style.display='';return;
  }
  empty.style.display='none';container.style.display='';
  container.innerHTML='';

  // Group by type
  const groups={};
  results.forEach(r=>{
    if(!groups[r.type])groups[r.type]=[];
    groups[r.type].push(r);
  });

  const typeNames={file:'Files',email:'Emails',event:'Calendar Events',note:'Notes'};
  Object.entries(groups).forEach(([type,items])=>{
    if(items.length){
      const title=document.createElement('div');
      title.className='drive-result-group-title';
      title.textContent=typeNames[type]||type;
      container.appendChild(title);
      items.forEach(item=>{
        const row=document.createElement('div');
        row.className='drive-result';
        row.innerHTML=`
          <div class="dr-type-ico ${type}">${typeIcon(type)}</div>
          <div class="dr-main">
            <div class="dr-title">${esc(item.title)}</div>
            <div class="dr-preview">${esc(item.preview)}</div>
          </div>
          <span class="dr-badge ${type}">${typeNames[type]||type}</span>
          <button class="dr-open">Open →</button>`;
        row.querySelector('.dr-open').addEventListener('click',(e)=>{
          e.stopPropagation();
          openItem(item);
        });
        row.addEventListener('click',()=>openItem(item));
        container.appendChild(row);
      });
    }
  });
}

function openItem(item){
  try{parent.postMessage({type:'atlas-open',app:item.app},'*');}catch(e){}
}

window.onSearch=function(){
  const q=document.getElementById('searchInput').value;
  document.getElementById('clearBtn').style.display=q?'':'none';
  clearTimeout(debounceTimer);
  debounceTimer=setTimeout(()=>{
    const results=search(q,activeFilter);
    render(results);
  },120);
};

window.clearSearch=function(){
  document.getElementById('searchInput').value='';
  document.getElementById('clearBtn').style.display='none';
  render([]);
  updateStats();
};

window.setFilter=function(filter){
  activeFilter=filter;
  document.querySelectorAll('.drive-filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
  const q=document.getElementById('searchInput').value;
  if(q||filter!=='all'){
    const results=search(q,filter);
    render(results);
  } else {
    document.getElementById('driveResults').style.display='none';
    document.getElementById('driveEmpty').style.display='none';
    document.getElementById('driveStats').style.display='grid';
  }
};

function esc(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

updateStats();
