/* ── inline <script> #1 ── */
// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const VALID_MODELS = new Set([
  'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'
]);
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const _savedModel = localStorage.getItem('advisore_model') || DEFAULT_MODEL;

const S = {
  mode: 'adviser',
  apiKey: localStorage.getItem('advisore_groq_key') || '',
  model: VALID_MODELS.has(_savedModel) ? _savedModel : DEFAULT_MODEL,
  busy: { adviser: false, coder: false, researcher: false },
  history: { adviser: [], coder: [], researcher: [] },
  tasks: [],
  notes: []
};

const SYSTEM = {
  adviser: `You are AdvisorE in Adviser mode — a sharp, experienced strategic advisor with expertise across business, finance, career development, leadership, and life decisions. You think clearly and give structured, actionable advice. You are direct but empathetic. Use numbered lists and bold key points when it aids clarity. Never give vague or generic advice — always tailor your response to the specific situation described. Ask follow-up questions when you need more context before advising.`,

  coder: `You are AdvisorE in Coder mode — an expert senior software engineer with 15+ years of experience across web, mobile, backend, databases, cloud, and systems architecture. You write clean, production-quality code with concise explanations. When writing code, use proper markdown code blocks with language syntax. Explain the reasoning behind your decisions. Point out edge cases. When reviewing code, be specific and constructive. Adapt to whatever tech stack or language the user is working with.`,

  researcher: `You are AdvisorE in Researcher mode — a rigorous analytical researcher with deep knowledge across science, technology, business, economics, history, and current events. You structure your responses clearly using bold headings and numbered or bulleted lists where appropriate. You distinguish between established facts and your own analysis. You acknowledge uncertainty when it exists. You provide multiple perspectives on contested topics. Your responses are thorough but concise — every sentence earns its place.`
};

// ═══════════════════════════════════════════════════════
// MODE SWITCHING
// ═══════════════════════════════════════════════════════
function switchMode(mode) {
  if (mode === S.mode) return;
  const prevMode = S.mode;
  S.mode = mode;
  const chatModes = ['adviser', 'coder', 'researcher'];
  const isChatMode = chatModes.includes(mode);

  // Clear history and reset UI whenever entering any AI chat mode
  if (isChatMode) {
    S.history[mode] = [];
    S.busy[mode] = false;
    const inner = document.getElementById('inner-' + mode);
    if (inner) inner.innerHTML = '';
    const welcome = document.getElementById('welcome-' + mode);
    if (welcome) welcome.style.display = '';
    const sendBtn = document.getElementById('send-' + mode);
    if (sendBtn) sendBtn.disabled = false;
  }

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + mode);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.nav-btn[id^="nav-"]').forEach(b => b.className = 'nav-btn');
  const nb = document.getElementById('nav-' + mode);
  if (nb) nb.className = 'nav-btn active-' + mode;

  const bar = document.getElementById('mode-bar');
  bar.style.display = isChatMode ? 'flex' : 'none';

  if (isChatMode) {
    document.querySelectorAll('.mode-tab').forEach(t => t.className = 'mode-tab');
    const tab = document.getElementById('tab-' + mode);
    if (tab) tab.className = 'mode-tab active-' + mode;
  }
}

// ═══════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════
function onKey(e, mode) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg(mode);
  }
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

async function sendMsg(mode) {
  if (S.busy[mode]) return;

  if (!S.apiKey) {
    showSetupSteps(mode);
    openSettings();
    return;
  }

  const ta = document.getElementById('input-' + mode);
  const text = ta.value.trim();
  if (!text) return;

  ta.value = '';
  ta.style.height = 'auto';

  hideWelcome(mode);

  const ts = now();
  S.history[mode].push({ role: 'user', content: text });
  addBubble(mode, 'user', text, ts);

  S.busy[mode] = true;
  document.getElementById('send-' + mode).disabled = true;
  const typingEl = addTyping(mode);

  try {
    const full = await streamGroq(mode, S.history[mode], typingEl);
    S.history[mode].push({ role: 'assistant', content: full });
  } catch (err) {
    typingEl.remove();
    S.history[mode].pop();
    toast('Error: ' + (err.message || 'Check your API key in Settings.'), 'error');
  } finally {
    S.busy[mode] = false;
    document.getElementById('send-' + mode).disabled = false;
  }
}

async function streamGroq(mode, history, typingEl) {
  const msgs = [{ role: 'system', content: SYSTEM[mode] }, ...history];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + S.apiKey
    },
    body: JSON.stringify({
      model: S.model,
      messages: msgs,
      stream: true,
      max_tokens: 8192,
      temperature: ['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3-32b'].includes(S.model) ? 1 : 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'HTTP ' + res.status);
  }

  typingEl.remove();

  const bubble = addStreamBubble(mode);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const d = line.slice(6).trim();
      if (d === '[DONE]') { finalizeStreamBubble(bubble, full); return full; }
      try {
        const p = JSON.parse(d);
        const tok = p.choices?.[0]?.delta?.content;
        if (tok) { full += tok; updateStreamBubble(bubble, full, mode); }
      } catch {}
    }
  }

  finalizeStreamBubble(bubble, full);
  return full;
}

// ── DOM helpers ──
function hideWelcome(mode) {
  const w = document.getElementById('welcome-' + mode);
  if (w) w.style.display = 'none';
}

function addBubble(mode, role, text, ts) {
  const inner = document.getElementById('inner-' + mode);
  const el = document.createElement('div');
  el.className = 'message ' + role;
  const avatarClass = role === 'ai' ? ('msg-avatar ai-' + mode) : 'msg-avatar';
  const name = role === 'user' ? 'You' : 'AdvisorE';
  el.innerHTML =
    `<div class="${avatarClass}">${role === 'user' ? '' : 'E'}</div>` +
    `<div class="msg-content">` +
      `<div class="msg-meta"><span class="msg-name">${name}</span><span class="msg-time">${ts}</span></div>` +
      `<div class="msg-bubble">${renderMD(text)}</div>` +
    `</div>`;
  inner.appendChild(el);
  scrollBottom(mode);
  return el;
}

function addTyping(mode) {
  const inner = document.getElementById('inner-' + mode);
  const el = document.createElement('div');
  el.className = 'message ai';
  el.innerHTML =
    `<div class="msg-avatar ai-${mode}">E</div>` +
    `<div class="msg-content">` +
      `<div class="msg-meta"><span class="msg-name">AdvisorE</span></div>` +
      `<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>` +
    `</div>`;
  inner.appendChild(el);
  scrollBottom(mode);
  return el;
}

function addStreamBubble(mode) {
  const inner = document.getElementById('inner-' + mode);
  const el = document.createElement('div');
  el.className = 'message ai';
  el.innerHTML =
    `<div class="msg-avatar ai-${mode}">E</div>` +
    `<div class="msg-content">` +
      `<div class="msg-meta"><span class="msg-name">AdvisorE</span><span class="msg-time">${now()}</span></div>` +
      `<div class="msg-bubble stream-bubble"></div>` +
    `</div>`;
  inner.appendChild(el);
  scrollBottom(mode);
  return el.querySelector('.stream-bubble');
}

function updateStreamBubble(bubble, text, mode) {
  bubble.innerHTML = renderMD(text, true) + '<span class="cursor">▍</span>';
  scrollBottom(mode);
}

function finalizeStreamBubble(bubble, text) {
  bubble.innerHTML = renderMD(text, false);
}

function scrollBottom(mode) {
  const area = document.getElementById('msgs-' + mode);
  if (area) requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
}

// ── Markdown renderer (safe — escapes HTML first) ──
function renderMD(text, isStreaming) {
  let thinkHTML = '';
  let mainText = text;

  // Handle complete <think>...</think> blocks
  mainText = mainText.replace(/<think>([\s\S]*?)<\/think>/gi, (_, content) => {
    const esc = content.trim()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    thinkHTML += `<details class="think-block"><summary class="think-label">Reasoning</summary><div class="think-content">${esc}</div></details>`;
    return '';
  });

  // Handle unclosed <think> block during streaming
  if (isStreaming) {
    const openIdx = mainText.lastIndexOf('<think>');
    if (openIdx !== -1 && mainText.indexOf('</think>', openIdx) === -1) {
      const thinkContent = mainText.slice(openIdx + 7);
      mainText = mainText.slice(0, openIdx);
      const esc = thinkContent
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      thinkHTML += `<details class="think-block in-progress" open><summary class="think-label">Reasoning</summary><div class="think-content">${esc}</div></details>`;
    }
  }

  mainText = mainText.trim();

  if (!mainText && !thinkHTML) return '';

  if (!mainText) return thinkHTML;

  const esc = mainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const fenced = [];
  let out = esc.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    fenced.push(`<pre><code>${code.trim()}</code></pre>`);
    return '\x00FENCE' + (fenced.length - 1) + '\x00';
  });

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<span class="block-heading">$1</span>')
    .replace(/\n/g, '<br>');

  fenced.forEach((f, i) => {
    out = out.replace('\x00FENCE' + i + '\x00', f);
  });

  return thinkHTML + out;
}

// ── File upload ──
async function onFile(e, mode) {
  const file = e.target.files[0];
  if (!file) return;
  const ta = document.getElementById('input-' + mode);
  const textExts = ['.txt','.md','.js','.ts','.jsx','.tsx','.py','.json','.csv','.html','.css','.yaml','.yml','.sql','.sh','.rs','.go','.java','.c','.cpp','.h'];
  const isText = file.type.startsWith('text/') || textExts.some(ext => file.name.toLowerCase().endsWith(ext));
  if (isText) {
    const content = await file.text();
    const trunc = content.length > 10000 ? content.slice(0, 10000) + '\n\n[... truncated ...]' : content;
    ta.value += (ta.value ? '\n\n' : '') + '[File: ' + file.name + ']\n```\n' + trunc + '\n```';
  } else {
    ta.value += (ta.value ? '\n\n' : '') + '[File attached: ' + file.name + ' — ' + (file.size / 1024).toFixed(1) + ' KB. Note: binary files cannot be read directly.]';
  }
  autoResize(ta);
  e.target.value = '';
}

// ═══════════════════════════════════════════════════════
// BACKGROUND TASKS
// ═══════════════════════════════════════════════════════
function addTask() {
  const ta = document.getElementById('task-input');
  const prompt = ta.value.trim();
  if (!prompt) return;
  const mode = document.getElementById('task-mode').value;
  S.tasks.push({ id: Date.now(), prompt, mode, status: 'pending', result: null });
  ta.value = '';
  renderTasks();
}

function delTask(id) {
  S.tasks = S.tasks.filter(t => t.id !== id);
  renderTasks();
}

function renderTasks() {
  const list = document.getElementById('task-list');
  if (S.tasks.length === 0) {
    list.innerHTML = '<div class="task-empty">No tasks yet. Add one above to get started.</div>';
    return;
  }
  list.innerHTML = '';
  S.tasks.forEach(task => {
    const el = document.createElement('div');
    el.className = 'task-card';
    el.id = 'task-' + task.id;
    const statusLabels = { pending: 'Pending', running: 'Running...', done: 'Done', error: 'Error' };
    const del = task.status !== 'running'
      ? `<button class="task-del" onclick="delTask(${task.id})" title="Delete">&#x2715;</button>` : '';
    el.innerHTML =
      `<div class="task-header">` +
        `<div style="flex:1">` +
          `<div class="task-mode-label ${task.mode}">${task.mode}</div>` +
          `<div class="task-prompt">${escHtml(task.prompt)}</div>` +
        `</div>` +
        `<div class="task-actions">` +
          `<span class="task-status ${task.status}">${statusLabels[task.status]}</span>` +
          del +
        `</div>` +
      `</div>` +
      (task.result ? `<div class="task-result">${renderMD(task.result)}</div>` : '');
    list.appendChild(el);
  });
}

async function runTasks() {
  if (!S.apiKey) { openSettings(); return; }
  const pending = S.tasks.filter(t => t.status === 'pending');
  if (!pending.length) { toast('No pending tasks to run.', 'info'); return; }
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';
  for (const task of pending) {
    task.status = 'running';
    renderTasks();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.apiKey },
        body: JSON.stringify({
          model: S.model,
          messages: [{ role: 'system', content: SYSTEM[task.mode] }, { role: 'user', content: task.prompt }],
          stream: false,
          max_tokens: 4096,
          temperature: ['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3-32b'].includes(S.model) ? 1 : 0.7
        })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'HTTP ' + res.status); }
      const data = await res.json();
      task.result = data.choices?.[0]?.message?.content || 'No response.';
      task.status = 'done';
    } catch (err) {
      task.result = 'Error: ' + err.message;
      task.status = 'error';
    }
    renderTasks();
  }
  btn.disabled = false;
  btn.textContent = 'Run All Pending Tasks';
}

// ═══════════════════════════════════════════════════════
// COWORK
// ═══════════════════════════════════════════════════════
function fmt(type) {
  const ta = document.querySelector('.doc-body');
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.substring(s, e);
  let rep = sel;
  if (type === 'bold')      rep = `**${sel}**`;
  else if (type === 'italic')    rep = `*${sel}*`;
  else if (type === 'underline') rep = `__${sel}__`;
  else if (type === 'heading')   rep = `\n# ${sel}`;
  else if (type === 'bullet')    rep = sel.split('\n').map(l => '• ' + l).join('\n');
  else if (type === 'code')      rep = sel.includes('\n') ? `\`\`\`\n${sel}\n\`\`\`` : `\`${sel}\``;
  else if (type === 'clear')     { ta.value = ''; return; }
  ta.value = ta.value.substring(0, s) + rep + ta.value.substring(e);
  ta.focus();
  ta.selectionStart = s + rep.length;
  ta.selectionEnd = s + rep.length;
}

function addNote() {
  const ta = document.getElementById('note-input');
  const text = ta.value.trim();
  if (!text) return;
  S.notes.push({ id: Date.now(), text });
  ta.value = '';
  renderNotes();
}

function delNote(id) {
  S.notes = S.notes.filter(n => n.id !== id);
  renderNotes();
}

function renderNotes() {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  S.notes.forEach(n => {
    const el = document.createElement('div');
    el.className = 'note-card';
    el.innerHTML = `<button class="note-del" onclick="delNote(${n.id})">&#x2715;</button>${escHtml(n.text)}`;
    list.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════
function openSettings() {
  document.getElementById('key-input').value = S.apiKey;
  document.getElementById('model-select').value = S.model;
  updateKeyStatus();
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
}

function overlayClick(e) {
  if (e.target === document.getElementById('settings-overlay')) closeSettings();
}

function autosaveKey(val) {
  const key = val.trim();
  if (key && key !== S.apiKey) {
    S.apiKey = key;
    localStorage.setItem('advisore_groq_key', key);
    updateKeyStatus();
    if (key) ['adviser','coder','researcher'].forEach(m => hideSetupSteps(m));
  }
}

function updateKeyStatus() {
  const el = document.getElementById('key-status');
  const inputEl = document.getElementById('key-input');
  const currentVal = inputEl ? inputEl.value.trim() : S.apiKey;
  const hasKey = currentVal || S.apiKey;
  if (hasKey) {
    el.innerHTML = '<span class="key-ok">Key saved and ready.</span>';
  } else {
    el.innerHTML = '<span class="key-missing">No key set — AI features disabled.</span>';
  }
}

function saveSettings() {
  const key = document.getElementById('key-input').value.trim();
  const model = document.getElementById('model-select').value;
  S.apiKey = key;
  S.model = model;
  localStorage.setItem('advisore_groq_key', key);
  localStorage.setItem('advisore_model', model);
  closeSettings();
  if (key) {
    ['adviser','coder','researcher'].forEach(m => { hideSetupSteps(m); });
    toast('Settings saved. AdvisorE is ready.', 'info');
  }
}

function showSetupSteps(mode) {
  const el = document.getElementById('setup-steps-' + mode);
  if (el) el.style.display = 'block';
}

function hideSetupSteps(mode) {
  const el = document.getElementById('setup-steps-' + mode);
  if (el) el.style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════════════════
function downloadHTML() {
  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'AdvisorE.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('AdvisorE.html downloaded.', 'info');
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer = null;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type === 'error' ? 'error-toast' : 'info-toast') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 4000);
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
(function init() {
  if (!S.apiKey) {
    ['adviser','coder','researcher'].forEach(m => showSetupSteps(m));
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSettings();
  });
  renderTasks();
  renderNotes();
})();