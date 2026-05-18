/* ── Atlas AdvisorE Full Panel ── */
(function(){
'use strict';

// ── State ──────────────────────────────────────────────
const ADV = {
  mode: 'adviser',
  busy: { adviser: false, coder: false, researcher: false },
  history: { adviser: [], coder: [], researcher: [] },
  tasks: [],
  notes: [],
  get apiKey() {
    return localStorage.getItem('advisore_groq_key') ||
           (function(){ try{ const a=JSON.parse(localStorage.getItem('atlas_ai')||'null'); return a&&a.groqKey||''; }catch(e){ return ''; } })();
  },
  get model() {
    return localStorage.getItem('advisore_model') || 'meta-llama/llama-4-scout-17b-16e-instruct';
  }
};

const VALID_MODELS = new Set([
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'qwen/qwen3-32b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b'
]);

const SYSTEM = {
  adviser: `You are AdvisorE in Adviser mode — a sharp, experienced strategic advisor with expertise across business, finance, career development, leadership, and life decisions. You think clearly and give structured, actionable advice. You are direct but empathetic. Use numbered lists and bold key points when it aids clarity. Never give vague or generic advice — always tailor your response to the specific situation described. Ask follow-up questions when you need more context before advising.`,
  coder: `You are AdvisorE in Coder mode — an expert senior software engineer with 15+ years of experience across web, mobile, backend, databases, cloud, and systems architecture. You write clean, production-quality code with concise explanations. When writing code, use proper markdown code blocks with language syntax. Explain the reasoning behind your decisions. Point out edge cases. When reviewing code, be specific and constructive. Adapt to whatever tech stack or language the user is working with.`,
  researcher: `You are AdvisorE in Researcher mode — a rigorous analytical researcher with deep knowledge across science, technology, business, economics, history, and current events. You structure your responses clearly using bold headings and numbered or bulleted lists where appropriate. You distinguish between established facts and your own analysis. You acknowledge uncertainty when it exists. You provide multiple perspectives on contested topics. Your responses are thorough but concise — every sentence earns its place.`
};

// ── Mode switching ──────────────────────────────────────
window.advSwitchMode = function(mode) {
  ADV.mode = mode;
  document.querySelectorAll('.adv-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById('advPane-' + mode);
  if (pane) pane.classList.add('active');
  document.querySelectorAll('.adv-tab').forEach(t => t.className = 'adv-tab');
  const tab = document.getElementById('advTab-' + mode);
  if (tab) tab.className = 'adv-tab at-' + mode;
};

// ── Key handler ────────────────────────────────────────
window.advKey = function(e, mode) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    advSend(mode);
  }
  if (e.key === 'Escape') {
    const panel = document.getElementById('advPanel');
    if (panel && panel.classList.contains('open')) toggleAdvisor();
  }
};

window.advResize = function(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
};

// ── Send message ───────────────────────────────────────
window.advSend = async function(mode) {
  if (ADV.busy[mode]) return;
  if (!ADV.apiKey) {
    const setup = document.getElementById('advSetup-' + mode);
    if (setup) setup.style.display = '';
    return;
  }
  const ta = document.getElementById('advInput-' + mode);
  const text = (ta.value || '').trim();
  if (!text) return;
  ta.value = '';
  ta.style.height = 'auto';

  const welcome = document.getElementById('advWelcome-' + mode);
  if (welcome) welcome.style.display = 'none';

  const ts = advNow();
  ADV.history[mode].push({ role: 'user', content: text });
  advAddBubble(mode, 'user', text, ts);

  ADV.busy[mode] = true;
  const sendBtn = document.getElementById('advSend-' + mode);
  if (sendBtn) sendBtn.disabled = true;
  const typingEl = advAddTyping(mode);

  try {
    const full = await advStream(mode, ADV.history[mode], typingEl);
    ADV.history[mode].push({ role: 'assistant', content: full });
    // Save to offline queue
    advSaveHistory();
  } catch (err) {
    typingEl.remove();
    ADV.history[mode].pop();
    if (window.showToast) showToast('AdvisorE: ' + (err.message || 'Check your Groq key in Settings.'));
  } finally {
    ADV.busy[mode] = false;
    if (sendBtn) sendBtn.disabled = false;
  }
};

async function advStream(mode, history, typingEl) {
  const msgs = [{ role: 'system', content: SYSTEM[mode] }, ...history];
  const model = VALID_MODELS.has(ADV.model) ? ADV.model : 'meta-llama/llama-4-scout-17b-16e-instruct';
  const needsTemp1 = ['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3-32b'].includes(model);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ADV.apiKey },
    body: JSON.stringify({ model, messages: msgs, stream: true, max_tokens: 8192, temperature: needsTemp1 ? 1 : 0.7 })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'HTTP ' + res.status);
  }

  typingEl.remove();
  const bubble = advAddStreamBubble(mode);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const d = line.slice(6).trim();
      if (d === '[DONE]') { advFinalBubble(bubble, full); return full; }
      try {
        const p = JSON.parse(d);
        const tok = p.choices?.[0]?.delta?.content;
        if (tok) { full += tok; advUpdateBubble(bubble, full); }
      } catch {}
    }
  }
  advFinalBubble(bubble, full);
  return full;
}

// ── DOM helpers ────────────────────────────────────────
function advAddBubble(mode, role, text, ts) {
  const inner = document.getElementById('advInner-' + mode);
  const el = document.createElement('div');
  el.className = 'adv-msg ' + role;
  const avClass = role === 'ai' ? ('adv-msg-av av-' + mode) : 'adv-msg-av';
  const avText = role === 'user' ? (advUserLetter()) : 'E';
  el.innerHTML =
    `<div class="${avClass}">${avText}</div>` +
    `<div class="adv-msg-body">` +
      `<div class="adv-msg-meta">${role === 'user' ? 'You' : 'AdvisorE'} · ${ts}</div>` +
      `<div class="adv-msg-bubble">${advRenderMD(text)}</div>` +
    `</div>`;
  inner.appendChild(el);
  advScroll(mode);
  return el;
}

function advAddTyping(mode) {
  const inner = document.getElementById('advInner-' + mode);
  const el = document.createElement('div');
  el.className = 'adv-msg ai';
  el.innerHTML =
    `<div class="adv-msg-av av-${mode}">E</div>` +
    `<div class="adv-msg-body"><div class="adv-msg-bubble"><div class="adv-dots"><span></span><span></span><span></span></div></div></div>`;
  inner.appendChild(el);
  advScroll(mode);
  return el;
}

function advAddStreamBubble(mode) {
  const inner = document.getElementById('advInner-' + mode);
  const el = document.createElement('div');
  el.className = 'adv-msg ai';
  el.innerHTML =
    `<div class="adv-msg-av av-${mode}">E</div>` +
    `<div class="adv-msg-body">` +
      `<div class="adv-msg-meta">AdvisorE · ${advNow()}</div>` +
      `<div class="adv-msg-bubble adv-stream"></div>` +
    `</div>`;
  inner.appendChild(el);
  advScroll(mode);
  return el.querySelector('.adv-stream');
}

function advUpdateBubble(bubble, text) {
  bubble.innerHTML = advRenderMD(text, true) + '<span class="adv-cursor">▍</span>';
  const area = bubble.closest('.adv-chat-scroll');
  if (area) requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
}

function advFinalBubble(bubble, text) {
  bubble.innerHTML = advRenderMD(text, false);
}

function advScroll(mode) {
  const area = document.getElementById('advMsgs-' + mode);
  if (area) requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
}

function advUserLetter() {
  try { const p = JSON.parse(localStorage.getItem('atlas_profile')||'null'); return (p&&p.name||'Y').charAt(0).toUpperCase(); } catch(e) { return 'Y'; }
}

// ── Markdown renderer ──────────────────────────────────
function advRenderMD(text, streaming) {
  let thinkHTML = '', main = text;

  main = main.replace(/<think>([\s\S]*?)<\/think>/gi, (_, c) => {
    const esc = c.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    thinkHTML += `<details class="adv-think"><summary>Reasoning</summary><div class="adv-think-body">${esc}</div></details>`;
    return '';
  });

  if (streaming) {
    const idx = main.lastIndexOf('<think>');
    if (idx !== -1 && main.indexOf('</think>', idx) === -1) {
      const c = main.slice(idx + 7);
      main = main.slice(0, idx);
      const esc = c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      thinkHTML += `<details class="adv-think" open><summary>Reasoning…</summary><div class="adv-think-body">${esc}</div></details>`;
    }
  }

  main = main.trim();
  if (!main && !thinkHTML) return '';
  if (!main) return thinkHTML;

  const esc = main.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fenced = [];
  let out = esc.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    fenced.push(`<pre><code>${code.trim()}</code></pre>`);
    return '\x00F' + (fenced.length - 1) + '\x00';
  });
  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<span class="adv-heading">$1</span>')
    .replace(/\n/g, '<br>');
  fenced.forEach((f, i) => { out = out.replace('\x00F' + i + '\x00', f); });
  return thinkHTML + out;
}

// ── File upload ────────────────────────────────────────
window.advOnFile = async function(e, mode) {
  const file = e.target.files[0];
  if (!file) return;
  const ta = document.getElementById('advInput-' + mode);
  const textExts = ['.txt','.md','.js','.ts','.jsx','.tsx','.py','.json','.csv','.html','.css','.yaml','.yml','.sql','.sh','.rs','.go','.java','.c','.cpp','.h','.liquid'];
  const isText = file.type.startsWith('text/') || textExts.some(ext => file.name.toLowerCase().endsWith(ext));
  if (isText) {
    const content = await file.text();
    const trunc = content.length > 10000 ? content.slice(0, 10000) + '\n\n[... truncated ...]' : content;
    ta.value += (ta.value ? '\n\n' : '') + '[File: ' + file.name + ']\n```\n' + trunc + '\n```';
  } else {
    ta.value += (ta.value ? '\n\n' : '') + '[File: ' + file.name + ' — ' + (file.size/1024).toFixed(1) + ' KB (binary)]';
  }
  advResize(ta);
  e.target.value = '';
};

// ── Background Tasks ───────────────────────────────────
window.advAddTask = function() {
  const ta = document.getElementById('advTaskInput');
  const prompt = (ta.value || '').trim();
  if (!prompt) return;
  const mode = document.getElementById('advTaskMode').value;
  ADV.tasks.push({ id: Date.now(), prompt, mode, status: 'pending', result: null });
  ta.value = '';
  advRenderTasks();
  advSaveTasks();
};

window.advDelTask = function(id) {
  ADV.tasks = ADV.tasks.filter(t => t.id !== id);
  advRenderTasks();
  advSaveTasks();
};

function advRenderTasks() {
  const list = document.getElementById('advTaskList');
  if (!list) return;
  if (!ADV.tasks.length) { list.innerHTML = '<div class="adv-task-empty">No tasks yet. Add one above.</div>'; return; }
  list.innerHTML = '';
  ADV.tasks.forEach(task => {
    const el = document.createElement('div');
    el.className = 'adv-task-card';
    el.id = 'advTask-' + task.id;
    const labels = { pending:'Pending', running:'Running…', done:'Done', error:'Error' };
    const del = task.status !== 'running' ? `<button class="adv-task-del" onclick="advDelTask(${task.id})">✕</button>` : '';
    el.innerHTML =
      `<div class="adv-task-top">` +
        `<div style="flex:1">` +
          `<div class="adv-task-mode-lbl ${task.mode}">${task.mode}</div>` +
          `<div class="adv-task-prompt">${advEsc(task.prompt)}</div>` +
        `</div>` +
        `<div class="adv-task-actions">` +
          `<span class="adv-task-status ${task.status}">${labels[task.status]}</span>` +
          del +
        `</div>` +
      `</div>` +
      (task.result ? `<div class="adv-task-result">${advRenderMD(task.result)}</div>` : '');
    list.appendChild(el);
  });
}

window.advRunTasks = async function() {
  if (!ADV.apiKey) { if(window.showToast) showToast('Add Groq key in Settings first.'); return; }
  const pending = ADV.tasks.filter(t => t.status === 'pending');
  if (!pending.length) { if(window.showToast) showToast('No pending tasks.'); return; }
  const btn = document.getElementById('advRunBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
  for (const task of pending) {
    task.status = 'running';
    advRenderTasks();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ADV.apiKey },
        body: JSON.stringify({ model: ADV.model, messages: [{ role:'system', content: SYSTEM[task.mode] }, { role:'user', content: task.prompt }], stream: false, max_tokens: 4096, temperature: 0.7 })
      });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || 'HTTP ' + res.status); }
      const data = await res.json();
      task.result = data.choices?.[0]?.message?.content || 'No response.';
      task.status = 'done';
    } catch (err) {
      task.result = 'Error: ' + err.message;
      task.status = 'error';
    }
    advRenderTasks();
    advSaveTasks();
  }
  if (btn) { btn.disabled = false; btn.textContent = '▶ Run All Pending'; }
};

// ── Cowork ─────────────────────────────────────────────
window.advFmt = function(type) {
  const ta = document.getElementById('advDocBody');
  if (!ta) return;
  if (type === 'clear') { ta.value = ''; return; }
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.substring(s, e);
  let rep = sel;
  if (type === 'bold')    rep = `**${sel}**`;
  else if (type === 'italic') rep = `*${sel}*`;
  else if (type === 'heading') rep = `\n# ${sel}`;
  else if (type === 'bullet') rep = sel.split('\n').map(l => '• ' + l).join('\n');
  else if (type === 'code') rep = sel.includes('\n') ? `\`\`\`\n${sel}\n\`\`\`` : `\`${sel}\``;
  ta.value = ta.value.substring(0, s) + rep + ta.value.substring(e);
  ta.focus();
  ta.selectionStart = s + rep.length;
  ta.selectionEnd = s + rep.length;
  advSaveCowork();
};

window.advAddNote = function() {
  const ta = document.getElementById('advNoteInput');
  const text = (ta.value || '').trim();
  if (!text) return;
  ADV.notes.push({ id: Date.now(), text });
  ta.value = '';
  advRenderNotes();
  advSaveNotes();
};

window.advDelNote = function(id) {
  ADV.notes = ADV.notes.filter(n => n.id !== id);
  advRenderNotes();
  advSaveNotes();
};

function advRenderNotes() {
  const list = document.getElementById('advNotesList');
  if (!list) return;
  list.innerHTML = '';
  ADV.notes.forEach(n => {
    const el = document.createElement('div');
    el.className = 'adv-note-card';
    el.innerHTML = `<button class="adv-note-del" onclick="advDelNote(${n.id})">✕</button>${advEsc(n.text)}`;
    list.appendChild(el);
  });
}

// ── Persistence (offline-first) ────────────────────────
function advSaveTasks() {
  try { localStorage.setItem('atlas_adv_tasks', JSON.stringify(ADV.tasks)); } catch(e) {}
}
function advLoadTasks() {
  try { const d = JSON.parse(localStorage.getItem('atlas_adv_tasks')||'[]'); ADV.tasks = d; } catch(e) {}
}
function advSaveNotes() {
  try { localStorage.setItem('atlas_adv_notes', JSON.stringify(ADV.notes)); } catch(e) {}
}
function advLoadNotes() {
  try { const d = JSON.parse(localStorage.getItem('atlas_adv_notes')||'[]'); ADV.notes = d; } catch(e) {}
}
function advSaveHistory() {
  try { localStorage.setItem('atlas_adv_history', JSON.stringify(ADV.history)); } catch(e) {}
}
function advLoadHistory() {
  try {
    const d = JSON.parse(localStorage.getItem('atlas_adv_history')||'null');
    if (d) {
      ['adviser','coder','researcher'].forEach(m => { if (d[m]) ADV.history[m] = d[m]; });
    }
  } catch(e) {}
}
function advSaveCowork() {
  try {
    const title = document.getElementById('advDocTitle');
    const body = document.getElementById('advDocBody');
    localStorage.setItem('atlas_adv_cowork', JSON.stringify({ title: title?.value||'', body: body?.value||'' }));
  } catch(e) {}
}
function advLoadCowork() {
  try {
    const d = JSON.parse(localStorage.getItem('atlas_adv_cowork')||'null');
    if (d) {
      const title = document.getElementById('advDocTitle');
      const body = document.getElementById('advDocBody');
      if (title) title.value = d.title || '';
      if (body) body.value = d.body || '';
    }
  } catch(e) {}
}

// ── Online/offline indicator ───────────────────────────
function advUpdateOnline() {
  const badge = document.getElementById('advOfflineBadge');
  if (badge) badge.classList.toggle('show', !navigator.onLine);
}

// ── Utils ──────────────────────────────────────────────
function advNow() {
  return new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}
function advEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Setup check ────────────────────────────────────────
function advCheckSetup() {
  const hasKey = !!ADV.apiKey;
  ['adviser','coder','researcher'].forEach(mode => {
    const el = document.getElementById('advSetup-' + mode);
    if (el) el.style.display = hasKey ? 'none' : '';
  });
}

// ── Init ───────────────────────────────────────────────
advLoadTasks();
advLoadNotes();
advLoadHistory();

// Restore histories into UI
['adviser','coder','researcher'].forEach(mode => {
  if (ADV.history[mode].length) {
    const welcome = document.getElementById('advWelcome-' + mode);
    if (welcome) welcome.style.display = 'none';
    ADV.history[mode].forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        advAddBubble(mode, msg.role === 'assistant' ? 'ai' : 'user', msg.content, '');
      }
    });
  }
});

advRenderTasks();
advRenderNotes();
advLoadCowork();
advCheckSetup();
advUpdateOnline();

window.addEventListener('online', () => { advUpdateOnline(); advCheckSetup(); });
window.addEventListener('offline', advUpdateOnline);

// Cowork autosave
const advDocBody = document.getElementById('advDocBody');
const advDocTitle = document.getElementById('advDocTitle');
if (advDocBody) advDocBody.addEventListener('input', advSaveCowork);
if (advDocTitle) advDocTitle.addEventListener('input', advSaveCowork);

// Re-check key whenever panel opens (catches Settings saves)
const origToggle = window.toggleAdvisor;
window.toggleAdvisor = function() {
  origToggle && origToggle();
  const panel = document.getElementById('advPanel');
  if (panel && panel.classList.contains('open')) advCheckSetup();
};

})();
