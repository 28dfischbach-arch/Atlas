/* Atlas DOM null-safety shim — wraps document.getElementById to return a
   chainable no-op proxy for missing elements, so legacy code that targets
   removed auth/onboarding/platform-shell DOM does not crash. */
(function(){
  if (window.__atlasDomShim) return; window.__atlasDomShim = true;
  var nullEl = new Proxy(function(){}, {
    get: function(t, k) {
      if (k === 'textContent' || k === 'innerText' || k === 'innerHTML' || k === 'value' || k === 'src' || k === 'href') return '';
      if (k === 'checked' || k === 'disabled' || k === 'hidden') return false;
      if (k === 'length') return 0;
      if (k === 'parentNode' || k === 'parentElement' || k === 'firstChild' || k === 'nextElementSibling') return null;
      if (k === 'ownerDocument') return document;
      if (k === Symbol.iterator) return function(){ return { next: function(){ return { done: true }; } }; };
      if (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf') return function(){ return ''; };
      if (k === 'tagName' || k === 'nodeName') return '';
      if (k === 'nodeType') return 1;
      // Function-like properties — return a function that returns nullEl
      return new Proxy(function(){ return nullEl; }, {
        get: function(){ return nullEl; },
        apply: function(){ return nullEl; }
      });
    },
    set: function(){ return true; },
    apply: function(){ return nullEl; },
    deleteProperty: function(){ return true; },
    has: function(){ return true; }
  });
  var origGetById = document.getElementById.bind(document);
  document.getElementById = function(id){
    try { var el = origGetById(id); return el || nullEl; }
    catch(e){ return nullEl; }
  };
})();
/* ── inline <script> #4 ── */
// ══════════════════════════════════════════════════════════
// HARDCODED CONFIG
// ══════════════════════════════════════════════════════════
const APP_VERSION  = 'v1.27.0';
const OWNER_EMAIL  = 'danefischbach6@gmail.com';
const OWNER_NAME   = 'Dane';
const SB_URL = 'https://ygsndjyuvbgovitbydke.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnc25kanl1dmJnb3ZpdGJ5ZGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNTg0MDgsImV4cCI6MjA5MDgzNDQwOH0.KmNQSxHkHfqpi_U266czNE3cKD4_6TthC3c6uKyi0Bw';
const AI_KEY_DEFAULT = ''; // Set your Anthropic key here or via Settings
const GUEST_AI_LIMIT = 10;

let currentUser = null;

// ══════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let state = {
  goal: 1600,
  goals: [],
  budgetRows: [],
  shifts: [],
  bills: [
    {name:'Phone Plan',     amount:45,  due:'1st', cat:'Essential', active:true},
    {name:'Auto Insurance', amount:120, due:'15th',cat:'Essential', active:true},
    {name:'Shopify',        amount:39,  due:'1st', cat:'Business',  active:true},
    {name:'Claude Pro',     amount:20,  due:'1st', cat:'Business',  active:true},
  ],
  aiName: 'Claude',
  aiPersonality: 'professional',
  aiFocus: 'balanced',
  aiAvatar: '#374151',
  avatarColor: '#7c3aed',
  userName: 'Dane',
  hourlyRate: 10.75,
  payFrequency: 'bimonthly',
  payType: 'hourly',
  payAmount: 0,
  alertThreshold: 0.8,
  alertsEnabled: true,
  autoSync: true,
  anthropicKey: AI_KEY_DEFAULT,
  connectedTools: {
    email: false,
    cashapp: false,
    google: false,
    receipt: true,
  },
  aiMsgCount: 0,
  lastSync: null,
  onboardingDone: false,
  scheduledJobs: {
    lastEmailScan: null,
    lastAnalysis: null,
    lastDeepAnalysis: null,
  },
  expenses: [],     // {id, amount, category, description, date, source}
  incomeLog: [],    // {id, amount, source, date}
  billsPaid: [],    // {billId, period}
  biweeklyAnchorDate: '2026-01-02',
  userBio: '',
  privacyAnalytics: true,
  privacyAI: true,
};

function getRowsPerMonth(){
  const freq = state.payFrequency || 'bimonthly';
  if(freq === 'monthly') return 1;
  if(freq === 'weekly') return 4;
  return 2;
}

function initBudgetRows(){
  const rpm = getRowsPerMonth();
  const prev = state.budgetRows || [];
  state.budgetRows = [];
  for(let m=0;m<12;m++){
    for(let r=0;r<rpm;r++){
      const existing = prev.find(x=>x.month===m && x.row===r);
      state.budgetRows.push(existing || {month:m, row:r, date:'', check:'', expenses:'', where:''});
    }
  }
}

function getBiweeklyPayDates(){
  const anchorStr = state.biweeklyAnchorDate || '2026-01-02';
  const anchor = new Date(anchorStr + 'T00:00:00');
  const dates = [];
  const start = new Date(anchor);
  start.setDate(start.getDate() - 28*14);
  for(let i=0;i<80;i++){
    const d = new Date(start);
    d.setDate(start.getDate() + i*14);
    dates.push(d);
  }
  return dates;
}

function getNextBiweeklyPayDate(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const dates = getBiweeklyPayDates();
  return dates.find(function(d){ return d >= today; }) || dates[dates.length-1];
}

function getBiweeklyPeriodForMonthRow(m, ri){
  const yr = new Date((state.biweeklyAnchorDate||'2026-01-02')+'T00:00:00').getFullYear();
  const allDates = getBiweeklyPayDates();
  const yrDates = allDates.filter(function(d){ return d.getFullYear()===yr; });
  const prevYrLast = allDates.filter(function(d){ return d.getFullYear()===yr-1; });
  const prevYrLastDate = prevYrLast.length ? prevYrLast[prevYrLast.length-1] : null;
  const allCombined = prevYrLastDate ? [prevYrLastDate].concat(yrDates) : yrDates;
  const inMonth = yrDates.filter(function(d){ return d.getMonth()===m; });
  if(!inMonth.length || ri >= inMonth.length) return null;
  const payDate = inMonth[ri];
  const payIdx = allCombined.findIndex(function(d){ return d.getTime()===payDate.getTime(); });
  const prevPay = payIdx > 0 ? allCombined[payIdx-1] : new Date(payDate.getTime()-14*86400000);
  const start = new Date(prevPay);
  start.setDate(start.getDate()+1);
  return { start: start, end: payDate };
}

// ══════════════════════════════════════════════════════════
// AUTH TAB SWITCHING
// ══════════════════════════════════════════════════════════
function switchAuthTab(tab){
  document.getElementById('tab-login').classList.toggle('active', tab==='login');
  document.getElementById('tab-signup').classList.toggle('active', tab==='signup');
  document.getElementById('form-login').style.display  = tab==='login'  ? '' : 'none';
  document.getElementById('form-signup').style.display = tab==='signup' ? '' : 'none';
  document.getElementById('login-error').textContent  = '';
  document.getElementById('signup-error').textContent = '';
}

// ══════════════════════════════════════════════════════════
// LOCAL USER STORE (works offline, no Supabase auth needed)
// ══════════════════════════════════════════════════════════
function getLocalUsers(){
  try{ return JSON.parse(localStorage.getItem('stck_local_users')||'{}'); }catch(e){ return {}; }
}
function saveLocalUser(email, name, pass){
  const users = getLocalUsers();
  users[email] = { name, pass, createdAt: new Date().toISOString() };
  localStorage.setItem('stck_local_users', JSON.stringify(users));
}

// ══════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════
async function handleLogin(){
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if(!email || !pass){ errEl.textContent = 'Enter email and password.'; return; }

  // 1. Check local user store first (always works offline)
  const users = getLocalUsers();
  if(users[email]){
    if(users[email].pass === pass){
      doLogin(email, users[email].name);
    } else {
      errEl.textContent = 'Wrong password. Try again.';
    }
    return;
  }

  // 2. Owner shortcut — any password 6+ chars works
  if(email === OWNER_EMAIL && pass.length >= 6){
    saveLocalUser(email, OWNER_NAME, pass);
    doLogin(email, OWNER_NAME);
    return;
  }

  // 3. Try Supabase as cloud fallback
  try{
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({email, password:pass})
    });
    const data = await res.json();
    if(!data.error && !data.error_description){
      const name = data.user?.user_metadata?.full_name || email.split('@')[0];
      saveLocalUser(email, name, pass);
      doLogin(email, name);
    } else {
      switchAuthTab('signup');
      document.getElementById('signup-email').value = email;
      document.getElementById('signup-error').textContent = 'No account found — create one below.';
    }
  } catch(e){
    switchAuthTab('signup');
    document.getElementById('signup-email').value = email;
    document.getElementById('signup-error').textContent = 'No account found — create one below.';
  }
}

// ══════════════════════════════════════════════════════════
// SIGNUP
// ══════════════════════════════════════════════════════════
async function handleSignup(){
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const pass  = document.getElementById('signup-pass').value;
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';

  if(!name){ errEl.textContent = 'Enter your full name.'; return; }
  if(!email || !email.includes('@')){ errEl.textContent = 'Enter a valid email.'; return; }
  if(pass.length < 6){ errEl.textContent = 'Password must be at least 6 characters.'; return; }

  const users = getLocalUsers();
  if(users[email]){ errEl.textContent = 'Account already exists. Sign in instead.'; return; }

  // Register locally right away — always works
  saveLocalUser(email, name, pass);
  doLogin(email, name);

  // Also try Supabase in the background
  try{
    await fetch(`${SB_URL}/auth/v1/signup`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Content-Type':'application/json'},
      body: JSON.stringify({email, password:pass, data:{full_name:name}})
    });
  } catch(e){}
}

// ══════════════════════════════════════════════════════════
// GOOGLE SIGN-IN (Placeholder — see SETUP INSTRUCTIONS above)
// ══════════════════════════════════════════════════════════
function handleGoogleSignIn(){
  showToast('Google Sign-In: coming soon.');
}

// ══════════════════════════════════════════════════════════
// DO LOGIN — transitions to onboarding or app
// ══════════════════════════════════════════════════════════
function doLogin(email, name){
  currentUser = { email, name, isOwner: email === OWNER_EMAIL, aiMsgCount: 0 };
  state.userName = name || email.split('@')[0];
  saveSession(email, name);
  loadLocal();

  if(!state.onboardingDone){
    // Show onboarding
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('onboard-step1').style.display = 'flex';
  } else {
    launchApp();
  }
}

function signOut(){
  currentUser = null;
  document.getElementById('app-wrap').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  switchAuthTab('login');
}

// ══════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════
let onboardAiName = 'Claude';
let onboardPersonality = 'professional';

function selectOnboardName(name, el){
  onboardAiName = name || 'Claude';
  document.getElementById('ob-ai-name-preview').textContent = onboardAiName;
  var logo=document.getElementById('ob-ai-logo');
  if(logo) logo.textContent=(onboardAiName||'CL').slice(0,2).toUpperCase();
  if(el){
    document.querySelectorAll('.name-chip').forEach(c=>c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('ob-custom-name').value = '';
  }
}

function selectOnboardPersonality(val, el){
  onboardPersonality = val;
  document.querySelectorAll('.personality-opt').forEach(o=>o.classList.remove('selected'));
  if(el) el.classList.add('selected');
}

function goOnboardIncome(){
  state.aiName = onboardAiName;
  state.aiPersonality = onboardPersonality;
  document.getElementById('onboard-step1').style.display = 'none';
  document.getElementById('onboard-income').style.display = 'flex';
}

function goOnboardStep2(){
  document.getElementById('onboard-income').style.display = 'none';
  document.getElementById('onboard-step2').style.display = 'flex';
}

let _selectedPayFreq = 'bimonthly';
let _selectedPayType = 'hourly';

function selectPayFreq(val, el){
  _selectedPayFreq = val;
  document.querySelectorAll('#freq-opts .income-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
}

function selectPayType(val, el){
  _selectedPayType = val;
  document.querySelectorAll('#type-opts .income-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  updatePayAmountLabel();
}

function updatePayAmountLabel(){
  const t = _selectedPayType;
  const lbl = document.getElementById('pay-amount-label');
  const hint = document.getElementById('pay-amount-hint');
  if(t === 'hourly'){
    lbl.textContent = 'Hourly Rate';
    hint.textContent = 'Enter your rate per hour — the app will calculate your estimated check from your hours.';
  } else if(t === 'salary'){
    lbl.textContent = 'Check Amount (after tax)';
    hint.textContent = 'How much hits your account each pay period? The app will use this as your expected income.';
  } else {
    lbl.textContent = 'Typical Job Pay';
    hint.textContent = 'Average amount you earn per job or project — used to estimate your monthly income.';
  }
}

function saveIncomeSetup(){
  const amt = parseFloat(document.getElementById('pay-amount-input').value) || 0;
  state.payFrequency = _selectedPayFreq;
  state.payType = _selectedPayType;
  state.payAmount = amt;
  if(_selectedPayType === 'hourly') state.hourlyRate = amt > 0 ? amt : state.hourlyRate;

  initBudgetRows();

  if(amt > 0 && _selectedPayType !== 'hourly'){
    const now = new Date();
    const m = now.getMonth();
    const rpm = getRowsPerMonth();
    for(let r=0;r<rpm;r++){
      const row = state.budgetRows[m*rpm+r];
      if(row && (!row.check || parseFloat(row.check)===0)) row.check = amt.toFixed(2);
    }
  }

  saveLocal();
  goOnboardStep2();
}

// ── Tool toggle in onboarding ──
const pendingTools = {};

function toggleTool(tool, el){
  const isOn = el.classList.toggle('on');
  if(isOn){
    // Show modal for connection
    openToolModal(tool, () => {
      pendingTools[tool] = true;
    }, () => {
      el.classList.remove('on');
    });
  } else {
    delete pendingTools[tool];
  }
}

function openToolModal(tool, onConfirm, onCancel){
  const configs = {
    email: {
      title: 'Connect Email',
      sub: 'Authorize Gmail to scan receipts and transactions.',
      body: `
        <div style="background:#0d0d0d;border:1px solid #1f1f1f;border-radius:8px;padding:14px;margin-bottom:16px;font-size:10px;color:var(--mid);line-height:1.7;">
          Gmail scanning uses your read-only access to find receipts, invoices, and purchase confirmations.
          Your emails are never stored — only financial data is extracted.
        </div>
        <div style="font-size:9px;color:#444;margin-bottom:8px;letter-spacing:0.1em;text-transform:uppercase;">API Endpoint (for dev)</div>
        <input type="text" class="auth-input" placeholder="Your Gmail API key or OAuth token" id="modal-email-key">
        <div style="font-size:9px;color:#444;margin-top:8px;">
          See Settings → Connected Tools → Email for full setup instructions.
        </div>
      `
    },
    cashapp: {
      title: 'Connect Cash App',
      sub: 'Import transactions via CSV export or paste.',
      body: `
        <div style="background:#0d0d0d;border:1px solid #1f1f1f;border-radius:8px;padding:14px;margin-bottom:16px;font-size:10px;color:var(--mid);line-height:1.7;">
          Cash App has no public API. Export your transactions as CSV from the app and upload here for automatic import.
        </div>
        <label class="btn btn-ghost" style="width:100%;justify-content:center;cursor:pointer;margin-bottom:8px;">
          Upload Cash App CSV
          <input type="file" accept=".csv" onchange="parseCashAppCSV(event)" style="display:none">
        </label>
        <div style="font-size:9px;color:#444;">Or paste transaction text below for AI parsing:</div>
        <textarea class="auth-input" placeholder="Paste transactions here..." id="modal-cashapp-text"
          style="height:80px;margin-top:6px;resize:none;"></textarea>
      `
    },
    google: {
      title: 'Connect Google Account',
      sub: 'Access Gmail and Google Sheets.',
      body: `
        <div style="background:#0d0d0d;border:1px solid #1f1f1f;border-radius:8px;padding:14px;margin-bottom:16px;font-size:10px;color:var(--mid);line-height:1.7;">
          Connects Gmail for receipt scanning and Google Sheets for budget export.
          Requires Google OAuth setup — see code comments for step-by-step instructions.
        </div>
        <button class="google-btn" onclick="handleGoogleSignIn()" style="width:100%;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>
      `
    },
    receipt: {
      title: 'Receipt Scanner',
      sub: 'Upload receipt images for AI data extraction.',
      body: `
        <div style="background:#0d0d0d;border:1px solid #1f1f1f;border-radius:8px;padding:14px;margin-bottom:16px;font-size:10px;color:var(--mid);line-height:1.7;">
          Upload a photo of any receipt and the AI will extract vendor, amount, date, and category automatically.
        </div>
        <div style="font-size:9px;color:#444;">Supported: JPG, PNG, PDF. Uses AI vision analysis.</div>
      `
    }
  };

  const cfg = configs[tool] || {title:'Connect Tool', sub:'', body:''};
  document.getElementById('modal-title').textContent = cfg.title;
  document.getElementById('modal-sub').textContent = cfg.sub;
  document.getElementById('modal-body').innerHTML = cfg.body + `
    <div style="display:flex;gap:8px;margin-top:20px;">
      <button class="onboard-btn" onclick="confirmToolModal('${tool}')" style="flex:1;">Connect</button>
      <button onclick="cancelToolModal()" style="flex:1;background:transparent;color:var(--mid);border:1px solid #2a2a2a;border-radius:8px;padding:11px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;">Cancel</button>
    </div>
  `;

  document.getElementById('tool-modal').classList.add('open');
  window._modalConfirm = onConfirm;
  window._modalCancel = onCancel;
}

function confirmToolModal(tool){
  state.connectedTools[tool] = true;
  closeToolModal();
  if(window._modalConfirm) window._modalConfirm();
  showToast(`${tool.charAt(0).toUpperCase()+tool.slice(1)} connected`);
}

function cancelToolModal(){
  closeToolModal();
  if(window._modalCancel) window._modalCancel();
}

function closeToolModal(){
  document.getElementById('tool-modal').classList.remove('open');
}

function toggleSettingsTool(tool, el){
  const isOn = el.classList.toggle('on');
  if(isOn){
    openToolModal(tool, ()=>{ state.connectedTools[tool]=true; saveSettings(); },
      ()=>{ el.classList.remove('on'); });
  } else {
    state.connectedTools[tool] = false;
    saveSettings();
  }
}

function skipOnboarding(){
  state.onboardingDone = true;
  saveLocal();
  launchApp();
}

function finishOnboarding(){
  state.aiName = onboardAiName;
  state.aiPersonality = onboardPersonality;
  Object.assign(state.connectedTools, pendingTools);
  state.onboardingDone = true;
  saveLocal();
  launchApp();
}

function goOnboardStep3(){
  document.getElementById('onboard-step2').style.display = 'none';
  document.getElementById('onboard-step3').style.display = 'flex';
}

function launchApp(){
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('onboard-step1').style.display = 'none';
  document.getElementById('onboard-income').style.display = 'none';
  document.getElementById('onboard-step2').style.display = 'none';
  document.getElementById('onboard-step3').style.display = 'none';
  document.getElementById('app-wrap').style.display = '';

  const ownerBadge = document.getElementById('owner-badge');
  if(currentUser?.isOwner) ownerBadge.style.display = 'flex';

  // Default quick-add date to today
  const qaDate = document.getElementById('qa-date');
  if(qaDate) qaDate.value = new Date().toISOString().slice(0,10);

  loadLocal();
  renderAll();
  initAI();
  loadFromSupabase();
  startScheduledJobs();
}

// ══════════════════════════════════════════════════════════
// STORAGE + SYNC
// ══════════════════════════════════════════════════════════
function getUserKey(){
  const email = currentUser?.email || 'guest';
  return 'stck_' + btoa(email).replace(/=/g,'');
}

function saveLocal(){
  try{ localStorage.setItem(getUserKey(), JSON.stringify(state)); } catch(e){}
}

function loadLocal(){
  try{
    const s = localStorage.getItem(getUserKey());
    if(s){
      const parsed = JSON.parse(s);
      state = {...state, ...parsed};
    }
  } catch(e){}
  if(!state.budgetRows || state.budgetRows.length !== 12 * getRowsPerMonth()) initBudgetRows();
  if(!state.expenses) state.expenses = [];
  if(!state.incomeLog) state.incomeLog = [];
  if(!state.connectedTools) state.connectedTools = {email:false,cashapp:false,google:false,receipt:true};
  if(!state.biweeklyAnchorDate) state.biweeklyAnchorDate = '2026-01-02';
  if(state.userBio === undefined) state.userBio = '';
  if(state.privacyAnalytics === undefined) state.privacyAnalytics = true;
  if(state.privacyAI === undefined) state.privacyAI = true;
  // Migrate legacy emoji aiAvatar values to default hex color
  if(state.aiAvatar && !state.aiAvatar.startsWith('#')) state.aiAvatar = '#374151';
  if(!state.avatarColor || !state.avatarColor.startsWith('#')) state.avatarColor = '#7c3aed';
  // Normalize bills: ensure each bill has an id, active flag, and all fields
  if(!state.billsPaid) state.billsPaid = [];
  (state.bills||[]).forEach(function(b,i){
    if(!b.id) b.id = 'bill-'+Date.now()+'-'+i;
    if(b.active === undefined) b.active = true;
    if(!b.due) b.due = '1st';
    if(!b.cat) b.cat = 'Other';
  });
  // Migrate + normalize goals (shared with importData and Supabase load paths)
  normalizeGoals();
}

function getSupabaseRowId(){
  const email = currentUser?.email || 'guest';
  return 'user_' + btoa(email).replace(/[^a-zA-Z0-9]/g,'').substring(0,20);
}

async function syncToSupabase(){
  if(!currentUser || !state.autoSync) return;
  try{
    const payload = {
      id: getSupabaseRowId(),
      data: JSON.stringify(state),
      updated_at: new Date().toISOString()
    };
    const res = await fetch(`${SB_URL}/rest/v1/budget_data`, {
      method:'POST',
      headers:{
        'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,
        'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    if(res.ok || res.status===201 || res.status===409){
      state.lastSync = new Date().toLocaleTimeString();
      const dot=document.getElementById('syncDot');
      const lbl=document.getElementById('syncLabel');
      if(dot) dot.style.background='var(--green)';
      if(lbl) lbl.textContent='Synced';
      const lst=document.getElementById('last-sync-time');
      if(lst) lst.textContent='Last synced: '+state.lastSync;
      const lss=document.getElementById('last-sync-sub');
      if(lss) lss.textContent='Last synced: '+state.lastSync;
    }
  } catch(e){
    const dot=document.getElementById('syncDot');
    if(dot) dot.style.background='var(--red)';
    const lbl=document.getElementById('syncLabel');
    if(lbl) lbl.textContent='Offline';
  }
}

async function loadFromSupabase(){
  if(!currentUser) return;
  try{
    const res = await fetch(
      `${SB_URL}/rest/v1/budget_data?id=eq.${getSupabaseRowId()}&select=data`,
      {headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`}}
    );
    if(res.ok){
      const rows = await res.json();
      if(rows && rows.length>0 && rows[0].data){
        const remote = JSON.parse(rows[0].data);
        // Smart merge: preserve any data added locally since app loaded
        const localExpCount = (state.expenses||[]).length;
        const localShiftCount = (state.shifts||[]).length;
        const localIncomeCount = (state.incomeLog||[]).length;
        state = {...state, ...remote};
        // Re-apply local additions if they are more recent than remote
        if(localExpCount > (state.expenses||[]).length) state.expenses = state._localExpenses || state.expenses;
        if(localShiftCount > (state.shifts||[]).length) state.shifts = state._localShifts || state.shifts;
        if(localIncomeCount > (state.incomeLog||[]).length) state.incomeLog = state._localIncome || state.incomeLog;
        if(state.biweeklyAnchorDate === undefined) state.biweeklyAnchorDate = '2026-01-02';
        if(state.userBio === undefined) state.userBio = '';
        if(state.privacyAnalytics === undefined) state.privacyAnalytics = true;
        if(state.privacyAI === undefined) state.privacyAI = true;
        if(!state.budgetRows || state.budgetRows.length !== 12*getRowsPerMonth()) initBudgetRows();
        // Re-run full goals normalization after remote merge
        normalizeGoals();
        saveLocal();
        renderAll();
        updateSettingsUI();
      }
    }
  } catch(e){}
}

async function syncNow(){
  showToast('Syncing...');
  await syncToSupabase();
  showToast('Synced');
}

function saveAndRefresh(){
  const gi = document.getElementById('goal-input');
  if(gi){
    state.goal = parseFloat(gi.value)||1600;
    // Bidirectional mirror: keep first goal's target in sync
    if(state.goals && state.goals.length > 0) state.goals[0].target = state.goal;
  }
  saveLocal();
  renderAll();
  syncToSupabase();
}

function saveSettings(){
  saveLocal();
  syncToSupabase();
}

// ══════════════════════════════════════════════════════════
// CALCULATIONS
// ══════════════════════════════════════════════════════════
function calcNet(check, expenses){
  const c=parseFloat(check)||0;
  const e=parseFloat(expenses)||0;
  if(!check) return null;
  return c-e;
}

function calcBudgetStatus(r1, r2){
  const n1=calcNet(r1.check,r1.expenses);
  const n2=calcNet(r2.check,r2.expenses);
  const e1=parseFloat(r1.expenses)||0;
  const e2=parseFloat(r2.expenses)||0;
  const c1=parseFloat(r1.check)||0;
  const c2=parseFloat(r2.check)||0;

  if(!r1.check) return 'N/A';
  if(!r2.check) return n1>0?'Good':'Bad';
  if(n2<0) return 'Bad';
  const totalExp=e1+e2;
  const totalCheck=c1+c2;
  if(totalExp===0) return 'Good';
  if(totalExp>=totalCheck*0.8) return 'Light';
  return 'Good';
}

function getTotals(){
  let totalIncome=0,totalExpenses=0,totalNet=0;
  state.budgetRows.forEach(r=>{
    const c=parseFloat(r.check)||0;
    const e=parseFloat(r.expenses)||0;
    const n=calcNet(r.check,r.expenses);
    totalIncome+=c;totalExpenses+=e;
    if(n!==null) totalNet+=n;
  });
  // Add tracked expenses
  const trackedExpenses = (state.expenses||[]).reduce((s,e)=>s+e.amount,0);
  return {totalIncome, totalExpenses: totalExpenses+trackedExpenses, totalNet: totalNet-trackedExpenses};
}

function getMonthlyData(){
  const months=[];
  const rpm=getRowsPerMonth();
  for(let m=0;m<12;m++){
    const rows=[];
    for(let r=0;r<rpm;r++) rows.push(state.budgetRows[m*rpm+r]);
    const income=rows.reduce((s,r)=>s+(parseFloat(r.check)||0),0);
    const expenses=rows.reduce((s,r)=>s+(parseFloat(r.expenses)||0),0);
    const net=income-expenses;
    const hasCheck=rows.some(r=>r.check);
    const status=!hasCheck?'N/A':net<0?'Bad':expenses>=income*0.8&&expenses>0?'Light':'Good';
    months.push({label:MONTHS[m],income,expenses,net,status});
  }
  return months;
}

function getAvgMonthlyIncome(){
  const months=getMonthlyData();
  const active=months.filter(m=>m.income>0);
  if(!active.length) return 0;
  return active.reduce((s,m)=>s+m.income,0)/active.length;
}

// Returns avg monthly net from last N active months (income > 0)
function getAvgMonthlyNet(n){
  const months=getMonthlyData();
  const active=months.filter(m=>m.income>0);
  if(!active.length) return 0;
  const slice=active.slice(-Math.min(n,active.length));
  return slice.reduce((s,m)=>s+m.net,0)/slice.length;
}

// Populate This Month stat cards on the Budget page
function renderBudgetMonthStats(){
  const m=new Date().getMonth();
  const rpm=getRowsPerMonth();
  const rows=Array.from({length:rpm},function(_,i){return state.budgetRows[m*rpm+i]||{};});
  const inc=rows.reduce(function(s,r){return s+(parseFloat(r.check)||0);},0);
  const exp=rows.reduce(function(s,r){return s+(parseFloat(r.expenses)||0);},0);
  const net=inc-exp;
  const hasData=rows.some(function(r){return r.check;});
  const status=!hasData?'—':net<0?'Bad':exp>=inc*0.8&&exp>0?'Light':'Good';
  const statusColors={Good:'green',Light:'yellow',Bad:'red'};
  const incEl=document.getElementById('bm-income');
  const expEl=document.getElementById('bm-expenses');
  const netEl=document.getElementById('bm-net');
  const netCard=document.getElementById('bm-net-card');
  const statusEl=document.getElementById('bm-status');
  const statusCard=document.getElementById('bm-status-card');
  if(incEl) incEl.textContent='$'+inc.toFixed(2);
  if(expEl) expEl.textContent='$'+exp.toFixed(2);
  if(netEl) netEl.textContent=(net>=0?'+$':'-$')+Math.abs(net).toFixed(2);
  if(netCard) netCard.className='stat-card '+(net>=0?'green':'red');
  if(statusEl) statusEl.textContent=status;
  if(statusCard) statusCard.className='stat-card '+(statusColors[status]||'');
}

// Returns current pay period key string e.g. "2026-04-1" or "2026-04"
function getCurrentPeriod(){
  const now=new Date();
  const y=now.getFullYear();
  const mo=String(now.getMonth()+1).padStart(2,'0');
  const freq=state.payFrequency||'bimonthly';
  if(freq==='bimonthly'||freq==='biweekly'){
    const half=now.getDate()<=14?'1':'2';
    return y+'-'+mo+'-'+half;
  }
  if(freq==='weekly'){
    const wk=Math.ceil(now.getDate()/7);
    return y+'-'+mo+'-w'+wk;
  }
  return y+'-'+mo;
}

// Days until next paycheck based on payFrequency
function getDaysUntilNextCheck(){
  const now=new Date();
  const freq=state.payFrequency||'bimonthly';
  let next;
  if(freq==='bimonthly'){
    // Paychecks land on the 1st and 15th; find the next one after today
    const candidates=[
      new Date(now.getFullYear(),now.getMonth(),15),
      new Date(now.getFullYear(),now.getMonth()+1,1),
      new Date(now.getFullYear(),now.getMonth()+1,15)
    ];
    next=candidates.find(function(d){return d>now;})||candidates[1];
  } else if(freq==='weekly'){
    // Next 7-day boundary from today
    next=new Date(now);
    next.setDate(now.getDate()+(7-now.getDay())||7);
  } else if(freq==='biweekly'){
    // Anchor-based: find the next Thursday in the biweekly cycle
    next = getNextBiweeklyPayDate();
  } else {
    // monthly — 1st of next month
    next=new Date(now.getFullYear(),now.getMonth()+1,1);
  }
  const diff=Math.ceil((next-now)/(1000*60*60*24));
  return Math.max(1,diff);
}

// Sum expenses[] in the last N days
function getRecentSpend(days){
  const cutoff=new Date();
  cutoff.setDate(cutoff.getDate()-days);
  return (state.expenses||[]).filter(function(e){
    return e.date && new Date(e.date)>=cutoff;
  }).reduce(function(s,e){ return s+e.amount; },0);
}

function getTotalBills(){
  return state.bills.filter(b=>b.active).reduce((s,b)=>s+b.amount,0);
}

function calcShiftHours(start, end){
  const s=parseFloat(start);
  const e=parseFloat(end);
  if(isNaN(s)||isNaN(e)||!start||!end) return null;
  let diff=e<s?(e+12)-s:e-s;
  if(diff<=0) diff+=12;
  if(diff>=5) diff-=0.5;
  return Math.round(diff*100)/100;
}

// ══════════════════════════════════════════════════════════
// RENDER BUDGET TABLE
// ══════════════════════════════════════════════════════════
function getPeriodLabel(freq, ri, m){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mo=months[m]||'';
  if(freq==='monthly') return mo+' 1–31';
  if(freq==='weekly') return mo+' Wk '+(ri+1);
  if(freq==='biweekly'){
    const period = getBiweeklyPeriodForMonthRow(m, ri);
    if(!period) return mo+' –';
    const fmt = function(d){ return months[d.getMonth()]+' '+d.getDate(); };
    return fmt(period.start)+' – '+fmt(period.end);
  }
  return ri===0?(mo+' 1–14'):(mo+' 15–31');
}

function renderBudgetTable(){
  const tbody=document.getElementById('budget-body');
  tbody.innerHTML='';
  let ytd=0;
  const freq=state.payFrequency||'bimonthly';
  const rpm=getRowsPerMonth();

  for(let m=0;m<12;m++){
    const rows=[];
    for(let r=0;r<rpm;r++) rows.push(state.budgetRows[m*rpm+r]);

    const monthIncome=rows.reduce((s,r)=>s+(parseFloat(r.check)||0),0);
    const monthExp=rows.reduce((s,r)=>s+(parseFloat(r.expenses)||0),0);
    const monthNet=rows.some(r=>r.check)?monthIncome-monthExp:null;
    const status=monthNet===null?'N/A':monthNet<0?'Bad':monthExp>=monthIncome*0.8&&monthExp>0?'Light':'Good';
    const statusClass={Good:'status-good',Light:'status-light',Bad:'status-bad','N/A':'status-na'}[status]||'status-na';

    rows.forEach((row,ri)=>{
      const tr=document.createElement('tr');
      tr.className=ri===0?'month-row-1':'month-row-2';
      const net=calcNet(row.check,row.expenses);
      const netStr=net===null?'N/A':(net>=0?'+$'+net.toFixed(2):'-$'+Math.abs(net).toFixed(2));
      const netClass=net===null?'':(net>=0?'net-pos':'net-neg');
      if(row.check) ytd+=parseFloat(row.check)||0;
      const ytdStr=row.check?'$'+ytd.toFixed(2):'—';
      const goalPct=net!==null&&state.goal?Math.round((net/state.goal)*100):null;
      const goalStr=goalPct!==null?goalPct+'':'—';
      const goalClass=goalPct!==null?(goalPct>=0?'net-pos':'net-neg'):'';
      const monthLabel=ri===0?`${m+1}/${new Date().getFullYear()}`:''; 
      const periodLabel=getPeriodLabel(freq,ri,m);

      tr.innerHTML=`
        <td style="text-align:center;">
          <input value="${row.date||''}" placeholder="${periodLabel}"
            onchange="updateRow(${m},${ri},'date',this.value)" style="text-align:center;color:var(--mid);">
        </td>
        <td style="text-align:right;">
          <input type="number" value="${row.check||''}" placeholder="—"
            onchange="updateRow(${m},${ri},'check',this.value)" style="text-align:right;">
        </td>
        <td style="text-align:right;">
          <input type="number" value="${row.expenses||''}" placeholder="—"
            onchange="updateRow(${m},${ri},'expenses',this.value)" style="text-align:right;">
        </td>
        <td>
          <input value="${row.where||''}" placeholder="${!row.check?'N/A':'Where did you spend?'}"
            onchange="updateRow(${m},${ri},'where',this.value)">
        </td>
        <td class="${netClass}" style="text-align:right;">${netStr}</td>
        ${ri===0?`<td rowspan="${rpm}" style="text-align:center;background:#1a1a1a;color:var(--mid);font-size:10px;vertical-align:middle;">${monthLabel}</td>`:''}
        ${ri===0?`<td rowspan="${rpm}" class="${statusClass}" style="vertical-align:middle;">${status}</td>`:''}
        <td style="text-align:right;color:var(--mid);">${ytdStr}</td>
        <td class="${goalClass}" style="text-align:right;">${goalStr}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  const {totalIncome,totalExpenses,totalNet}=getTotals();
  const tr=document.createElement('tr');
  tr.className='totals-row';
  const totalNetClass=totalNet>=0?'net-pos':'net-neg';
  const totalNetStr=totalNet>=0?'+$'+totalNet.toFixed(2):'-$'+Math.abs(totalNet).toFixed(2);
  tr.innerHTML=`
    <td>Totals</td>
    <td style="text-align:right;">$${totalIncome.toFixed(2)}</td>
    <td style="text-align:right;">$${totalExpenses.toFixed(2)}</td>
    <td>—</td>
    <td class="${totalNetClass}" style="text-align:right;">${totalNetStr}</td>
    <td>—</td><td>—</td>
    <td style="text-align:right;">$${totalIncome.toFixed(2)}</td>
    <td style="text-align:right;"></td>
  `;
  tbody.appendChild(tr);
  renderBudgetMonthStats();
}

function updateRow(month, rowIdx, field, value){
  state.budgetRows[month*getRowsPerMonth()+rowIdx][field]=value;
  saveLocal();
  renderAll();
  syncToSupabase();
}

// ══════════════════════════════════════════════════════════
// RENDER DASHBOARD
// ══════════════════════════════════════════════════════════
function renderDashboard(){
  const {totalIncome,totalExpenses,totalNet}=getTotals();
  const goalPct=state.goal?Math.round((totalNet/state.goal)*100):0;

  document.getElementById('d-income').textContent='$'+totalIncome.toFixed(2);
  document.getElementById('d-expenses').textContent='$'+totalExpenses.toFixed(2);
  document.getElementById('d-net').textContent=(totalNet>=0?'+$':'-$')+Math.abs(totalNet).toFixed(2);
  document.getElementById('d-goal-pct').textContent=goalPct+'%';
  document.getElementById('d-goal-sub').textContent='of $'+state.goal+' goal';

  const netCard=document.getElementById('d-net-card');
  netCard.className='stat-card '+(totalNet>=0?'green':'red');

  document.getElementById('prog-label-left').textContent='$'+totalNet.toFixed(2)+' net';
  document.getElementById('prog-label-right').textContent='Goal: $'+state.goal;
  const pct=Math.max(0,Math.min(100,(totalNet/state.goal)*100));
  const fill=document.getElementById('prog-fill');
  fill.style.width=pct+'%';
  fill.style.background=totalNet>=0?'var(--green)':'var(--red)';

  const now=new Date().getMonth();
  const _rpm2=getRowsPerMonth();
  const _mrows=Array.from({length:_rpm2},(_,i)=>state.budgetRows[now*_rpm2+i]||{});
  const _minc=_mrows.reduce((s,r)=>s+(parseFloat(r.check)||0),0),_mexp=_mrows.reduce((s,r)=>s+(parseFloat(r.expenses)||0),0);
  const status=!_mrows.some(r=>r.check)?'N/A':(_minc-_mexp)<0?'Bad':_mexp>=_minc*0.8&&_mexp>0?'Light':'Good';
  const statusColors={Good:'var(--green)',Light:'var(--yellow)',Bad:'var(--red)','N/A':'var(--mid)'};
  document.getElementById('dash-status').innerHTML=`
    <div style="font-family:'Syne',sans-serif;font-size:40px;font-weight:800;color:${statusColors[status]||'var(--mid)'};">${status}</div>
    <div style="font-size:10px;color:var(--mid);margin-top:8px;">${MONTH_FULL[now]} Budget Status</div>
  `;

  document.getElementById('dash-date').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // ── Savings Rate card ──
  const savingsRate=totalIncome>0?Math.round((totalNet/totalIncome)*100):null;
  const srEl=document.getElementById('d-savings-rate');
  const srCard=document.getElementById('d-savings-card');
  const srSub=document.getElementById('d-savings-sub');
  if(savingsRate===null){
    srEl.textContent='—';srCard.className='stat-card';srSub.textContent='no income yet';
  } else {
    srEl.textContent=savingsRate+'%';
    srSub.textContent='of income saved (YTD)';
    srCard.className=savingsRate>=20?'stat-card green':savingsRate>=10?'stat-card yellow':'stat-card red';
  }

  // ── Time to Goal card ──
  const primaryGoal=(state.goals&&state.goals.length)?state.goals[0]:null;
  const goalTimeEl=document.getElementById('d-goal-time');
  const goalTimeCard=document.getElementById('d-goal-time-card');
  const goalTimeSub=document.getElementById('d-goal-time-sub');
  const avgNet3=getAvgMonthlyNet(3);
  if(primaryGoal && primaryGoal.target>0){
    const remaining=Math.max(0,primaryGoal.target-primaryGoal.saved);
    if(remaining===0){
      goalTimeEl.textContent='Done';goalTimeCard.className='stat-card green';goalTimeSub.textContent='Goal reached!';
    } else if(avgNet3>0){
      const monthsLeft=Math.ceil(remaining/avgNet3);
      if(monthsLeft<=36){
        const eta=new Date();eta.setMonth(eta.getMonth()+monthsLeft);
        const etaStr=eta.toLocaleDateString('en-US',{month:'short',year:'numeric'});
        goalTimeEl.textContent=monthsLeft+' mo';goalTimeSub.textContent='on track by '+etaStr;
        goalTimeCard.className=monthsLeft<=6?'stat-card green':monthsLeft<=18?'stat-card yellow':'stat-card';
      } else {
        goalTimeEl.textContent=monthsLeft+' mo';goalTimeSub.textContent='at avg $'+avgNet3.toFixed(0)+'/mo net';
        goalTimeCard.className='stat-card';
      }
    } else {
      goalTimeEl.textContent='—';goalTimeSub.textContent='log income to project';goalTimeCard.className='stat-card';
    }
  } else {
    goalTimeEl.textContent='—';goalTimeSub.textContent='no goal set';goalTimeCard.className='stat-card';
  }

  // ── Next Check countdown card ──
  const nextCheckDays=getDaysUntilNextCheck();
  document.getElementById('d-next-check').textContent=nextCheckDays===1?'Tomorrow':nextCheckDays+' days';
  document.getElementById('d-next-check-sub').textContent='until next paycheck';
  document.getElementById('d-next-check-card').className=nextCheckDays<=2?'stat-card green':'stat-card blue';

  // ── This Week's Spending card ──
  const weekSpend=getRecentSpend(7);
  const priorWeekSpend=getRecentSpend(14)-weekSpend;
  const weekEl=document.getElementById('d-week-spend');
  const weekSub=document.getElementById('d-week-sub');
  const weekCard=document.getElementById('d-week-card');
  weekEl.textContent='$'+weekSpend.toFixed(2);
  if(priorWeekSpend>0){
    const delta=weekSpend-priorWeekSpend;
    const arrow=delta>0?'up':'down';
    const sign=delta>0?'+':'-';
    weekSub.textContent=sign+'$'+Math.abs(delta).toFixed(2)+' vs prior week ('+arrow+')';
    weekCard.className=delta>0?'stat-card red':'stat-card green';
  } else {
    weekSub.textContent='last 7 days of tracked expenses';weekCard.className='stat-card';
  }

  renderAlerts();
  renderDashChart();
}

function renderAlerts(){
  if(!state.alertsEnabled) return;
  const wrap=document.getElementById('alerts-wrap');
  wrap.innerHTML='';
  const {totalIncome,totalExpenses,totalNet}=getTotals();
  const alerts=[];

  if(totalExpenses>0&&totalIncome>0){
    const ratio=totalExpenses/totalIncome;
    if(ratio>=0.9) alerts.push({type:'danger',msg:'Expenses are over 90% of income. Immediate action needed.'});
    else if(ratio>=state.alertThreshold) alerts.push({type:'warn',msg:'Expenses are '+Math.round(ratio*100)+'% of income. Watch your spending.'});
  }

  const bills=getTotalBills();
  const avgIncome=getAvgMonthlyIncome();
  if(avgIncome>0&&bills>0&&avgIncome<bills*2) alerts.push({type:'warn',msg:'Income is less than 2× your bills.'});
  if(totalNet>0&&totalNet>=state.goal) alerts.push({type:'good',msg:'You\'ve hit your $'+state.goal+' goal!'});
  if(totalNet<0) alerts.push({type:'danger',msg:'Your net is negative. Expenses exceed income.'});

  alerts.forEach(a=>{
    const div=document.createElement('div');
    div.className='alert '+a.type;
    div.innerHTML=a.msg;
    wrap.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════════
let charts={};

function makeChartOpts(extra={}){
  return {
    responsive:true,
    plugins:{legend:{display:false},...(extra.plugins||{})},
    scales:{
      x:{ticks:{color:'#6b7280',font:{family:'DM Mono',size:9}},grid:{color:'rgba(0,0,0,0.06)'}},
      y:{ticks:{color:'#6b7280',font:{family:'DM Mono',size:9}},grid:{color:'rgba(0,0,0,0.08)'}},
      ...(extra.scales||{})
    },
    ...extra
  };
}

function renderDashChart(){
  const months=getMonthlyData().filter(m=>m.income>0||m.expenses>0);
  const labels=months.map(m=>m.label);
  const data=months.map(m=>m.net);
  const colors=data.map(v=>v>=0?'rgba(34,197,94,0.7)':'rgba(239,68,68,0.7)');

  if(charts.dash) charts.dash.destroy();
  const ctx=document.getElementById('dashChart').getContext('2d');
  charts.dash=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:colors,borderRadius:4,borderSkipped:false}]},
    options:makeChartOpts()
  });
}

function renderCharts(){
  const months=getMonthlyData();
  const labels=months.map(m=>m.label);

  if(charts.bar) charts.bar.destroy();
  charts.bar=new Chart(document.getElementById('barChart').getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[
      {label:'Income',data:months.map(m=>m.income),backgroundColor:'rgba(34,197,94,0.6)',borderRadius:3},
      {label:'Expenses',data:months.map(m=>m.expenses),backgroundColor:'rgba(239,68,68,0.6)',borderRadius:3}
    ]},
    options:{...makeChartOpts(),plugins:{legend:{display:true,labels:{color:'#9CA3AF',font:{family:'DM Mono',size:9}}}}}
  });

  if(charts.line) charts.line.destroy();
  const netData=months.map(m=>m.net);
  charts.line=new Chart(document.getElementById('lineChart').getContext('2d'),{
    type:'line',
    data:{labels,datasets:[{
      data:netData,
      borderColor:'rgba(59,130,246,0.8)',
      backgroundColor:'rgba(59,130,246,0.1)',
      fill:true,tension:0.4,pointRadius:4,
      pointBackgroundColor:netData.map(v=>v>=0?'var(--green)':'var(--red)')
    }]},
    options:makeChartOpts()
  });

  const whereMap={};
  state.budgetRows.forEach(r=>{
    if(r.where&&r.expenses){
      const k=r.where.split(',')[0].trim()||'Other';
      whereMap[k]=(whereMap[k]||0)+(parseFloat(r.expenses)||0);
    }
  });
  (state.expenses||[]).forEach(e=>{
    const k=e.category||'Other';
    whereMap[k]=(whereMap[k]||0)+e.amount;
  });
  const whereLabels=Object.keys(whereMap);
  const whereData=Object.values(whereMap);
  const donutColors=['#22C55E','#EAB308','#EF4444','#3B82F6','#F97316','#8B5CF6','#EC4899','#14B8A6'];
  if(charts.donut) charts.donut.destroy();
  charts.donut=new Chart(document.getElementById('donutChart').getContext('2d'),{
    type:'doughnut',
    data:{labels:whereLabels.length?whereLabels:['No data'],datasets:[{
      data:whereData.length?whereData:[1],
      backgroundColor:whereLabels.length?donutColors:['#e5e7eb'],
      borderWidth:0,hoverOffset:4
    }]},
    options:{responsive:true,plugins:{legend:{display:true,position:'right',labels:{color:'#9CA3AF',font:{family:'DM Mono',size:9},boxWidth:10}}},cutout:'65%'}
  });

  let cumulative=0;
  const cumData=months.map(m=>{cumulative+=m.income;return cumulative;});
  if(charts.area) charts.area.destroy();
  charts.area=new Chart(document.getElementById('areaChart').getContext('2d'),{
    type:'line',
    data:{labels,datasets:[{
      data:cumData,
      borderColor:'rgba(139,92,246,0.8)',
      backgroundColor:'rgba(139,92,246,0.15)',
      fill:true,tension:0.4,pointRadius:3
    }]},
    options:makeChartOpts()
  });
}

// ── Goals helpers ──────────────────────────────────────────

// Normalize goals array: ensures required fields, IDs, and migrates
// any pre-existing saved baseline into a contribution record so that
// goal.saved (recomputed from contributions) always stays accurate.
function normalizeGoals(){
  if(!state.goals || !Array.isArray(state.goals) || state.goals.length === 0){
    state.goals = [{
      id:'goal-1', name:'Gaming PC', target:state.goal||1600,
      saved:0, targetDate:'', note:'', contributions:[]
    }];
  }
  state.goals.forEach(function(g){
    if(!g.contributions) g.contributions = [];
    if(!g.id) g.id = 'goal-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    if(g.targetDate === undefined) g.targetDate = '';
    if(g.note === undefined) g.note = '';
    // Assign IDs to any legacy contributions missing one
    g.contributions.forEach(function(c){
      if(!c.id) c.id = 'c-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
      if(c.note === undefined) c.note = '';
    });
    // If goal has a pre-existing saved baseline with no contributions, migrate it
    // into a baseline contribution so that recompute-from-sum stays accurate.
    if((g.saved||0) > 0 && g.contributions.length === 0){
      const cid = 'c-baseline-'+g.id;
      g.contributions.push({id:cid, amount:g.saved, date:new Date().toISOString().slice(0,10), note:'(baseline)'});
    }
    // Recompute saved as source of truth from contributions
    g.saved = g.contributions.reduce(function(s,c){return s+(c.amount||0);},0);
  });
}

function syncGoalBackcompat(){
  // Keep legacy state.goal mirroring the first goal's target for backward compat.
  // When all goals are deleted, state.goal retains its current value (no reset).
  if(state.goals && state.goals.length > 0){
    state.goal = state.goals[0].target || 1600;
  }
  // If no goals remain, state.goal keeps its prior value as a neutral fallback.
}

function getChecksUntilDate(targetDate){
  if(!targetDate) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const tDate = new Date(targetDate);
  tDate.setHours(0,0,0,0);
  if(tDate < today) return 0;
  const freq = state.payFrequency || 'bimonthly';
  if(freq === 'biweekly'){
    const allDates = getBiweeklyPayDates();
    const count = allDates.filter(function(d){ return d >= today && d <= tDate; }).length;
    return Math.max(1, count);
  }
  const daysLeft = (tDate - today) / (1000 * 60 * 60 * 24);
  if(freq === 'weekly')  return Math.max(1, Math.ceil(daysLeft / 7));
  if(freq === 'monthly') return Math.max(1, Math.ceil(daysLeft / 30));
  return Math.max(1, Math.ceil(daysLeft / 15));
}

function goalTrackStatus(g){
  if(!g.targetDate) return {label:'No Date', cls:'grey'};
  const checksRemaining = getChecksUntilDate(g.targetDate);
  if(checksRemaining === 0) return {label:'Overdue', cls:'red'};
  const saved = g.saved || 0;
  const target = g.target || 0;
  const remaining = Math.max(0, target - saved);
  // Goal already met
  if(remaining === 0) return {label:'On Track', cls:'green'};
  // No contributions yet — can't determine pace
  if(!g.contributions || g.contributions.length === 0){
    return {label:'Behind', cls:'red'};
  }
  // Elapsed-period pace: use earliest contribution date as goal start
  const today = new Date(); today.setHours(0,0,0,0);
  const tDate = new Date(g.targetDate); tDate.setHours(0,0,0,0);
  const contribDates = g.contributions.map(function(c){return new Date(c.date);}).filter(function(d){return !isNaN(d);});
  const startDate = contribDates.length > 0 ? new Date(Math.min.apply(null,contribDates)) : today;
  startDate.setHours(0,0,0,0);
  const freq = state.payFrequency || 'bimonthly';
  const period = freq==='weekly'?7:freq==='biweekly'?14:freq==='monthly'?30:15;
  const elapsedDays = Math.max(0, (today - startDate) / (1000*60*60*24));
  const checksElapsed = Math.ceil(elapsedDays / period) || 1;
  const checksTotal = checksElapsed + checksRemaining;
  // Expected saved by now based on linear pace toward target
  const expectedSavedNow = (target / checksTotal) * checksElapsed;
  if(saved >= expectedSavedNow) return {label:'On Track', cls:'green'};
  if(saved >= expectedSavedNow * 0.75) return {label:'Close', cls:'yellow'};
  return {label:'Behind', cls:'red'};
}

function fmt$(n){ return '$'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function renderGoals(){
  const goals = state.goals || [];
  syncGoalBackcompat();

  const summaryEl = document.getElementById('goals-summary');
  const listEl = document.getElementById('goals-list');
  if(!summaryEl || !listEl) return;

  // Monthly progress chart (re-draw)
  const months = getMonthlyData();
  const labels = months.map(function(m){return m.label;});
  let cum = 0;
  const cumNet = months.map(function(m){cum+=m.net;return cum;});
  const goalLine = months.map(function(){return state.goal;});
  if(charts.goal) charts.goal.destroy();
  const goalCanvas = document.getElementById('goalChart');
  if(goalCanvas){
    charts.goal = new Chart(goalCanvas.getContext('2d'),{
      type:'line',
      data:{labels:labels,datasets:[
        {label:'Net Progress',data:cumNet,borderColor:'rgba(34,197,94,0.8)',backgroundColor:'rgba(34,197,94,0.1)',fill:true,tension:0.4,pointRadius:3},
        {label:'Goal',data:goalLine,borderColor:'rgba(0,0,0,0.2)',borderDash:[4,4],pointRadius:0,fill:false}
      ]},
      options:{...makeChartOpts(),plugins:{legend:{display:true,labels:{color:'#9CA3AF',font:{family:'DM Mono',size:9},boxWidth:10}}}}
    });
  }

  // Summary strip
  const totalSaved = goals.reduce(function(s,g){return s+(g.saved||0);},0);
  const totalTarget = goals.reduce(function(s,g){return s+(g.target||0);},0);
  const avgPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved/totalTarget)*100)) : 0;
  summaryEl.innerHTML =
    '<div class="goals-summary-card"><div class="goals-summary-label">Total Saved</div><div class="goals-summary-value">'+fmt$(totalSaved)+'</div><div class="goals-summary-sub">across '+goals.length+' goal'+(goals.length!==1?'s':'')+'</div></div>'+
    '<div class="goals-summary-card"><div class="goals-summary-label">Total Remaining</div><div class="goals-summary-value">'+fmt$(Math.max(0,totalTarget-totalSaved))+'</div><div class="goals-summary-sub">to hit all targets</div></div>'+
    '<div class="goals-summary-card"><div class="goals-summary-label">Overall Progress</div><div class="goals-summary-value">'+avgPct+'%</div><div class="goals-summary-sub">combined completion</div></div>';

  // Goals list
  if(goals.length === 0){
    listEl.innerHTML='<div class="goals-empty">No goals yet. Add one above.</div>';
    return;
  }

  listEl.innerHTML = '';
  goals.forEach(function(g){
    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved/g.target)*100)) : 0;
    const remaining = Math.max(0, (g.target||0) - (g.saved||0));
    const track = goalTrackStatus(g);
    const checks = g.targetDate ? getChecksUntilDate(g.targetDate) : null;
    const perCheck = (checks && checks > 0 && remaining > 0) ? (remaining / checks) : null;
    const barColor = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)';
    const dateDisplay = g.targetDate ? g.targetDate : 'No date';

    const card = document.createElement('div');
    card.className = 'goal-card';
    card.id = 'goal-card-'+g.id;

    // Contribution log rows
    let contribHtml = '';
    if(g.contributions && g.contributions.length > 0){
      const sorted = g.contributions.slice().sort(function(a,b){return new Date(b.date)-new Date(a.date);});
      sorted.forEach(function(c){
        const cid = escHtml(c.id||'');
        contribHtml += '<div class="goal-contrib-item"><span style="color:#555;">'+escHtml(c.date)+'</span><span style="color:var(--off);">'+fmt$(c.amount)+'</span>'+(c.note?'<span style="color:#444;font-style:italic;flex:1;text-align:right;padding-left:12px;">'+escHtml(c.note)+'</span>':'')+'<span style="cursor:pointer;color:#333;margin-left:12px;" onclick="removeGoalContrib(\''+g.id+'\',\''+cid+'\')">x</span></div>';
      });
    } else {
      contribHtml = '<div style="font-size:9px;color:#333;padding:8px 0;">No contributions yet.</div>';
    }

    card.innerHTML =
      '<div class="goal-card-top" onclick="toggleGoalExpand(\''+g.id+'\')">'
        +'<div class="goal-card-header">'
          +'<div>'
            +'<div class="goal-name">'+escHtml(g.name)+'</div>'
            +(g.note?'<div class="goal-note">'+escHtml(g.note)+'</div>':'')
            +'<div class="goal-note" style="color:#3a3a3a;margin-top:3px;">Target: '+escHtml(dateDisplay)+'</div>'
          +'</div>'
          +'<div style="display:flex;align-items:center;gap:10px;">'
            +'<span class="track-badge '+track.cls+'">'+track.label+'</span>'
            +'<span class="goal-expand-icon">v</span>'
          +'</div>'
        +'</div>'
        +'<div class="goal-bar-track"><div class="goal-bar-fill" style="width:'+pct+'%;background:'+barColor+';"></div></div>'
        +'<div class="goal-stats-row">'
          +'<div class="goal-stat"><div class="goal-stat-label">Saved</div><div class="goal-stat-value" style="color:var(--green);">'+fmt$(g.saved)+'</div></div>'
          +'<div class="goal-stat"><div class="goal-stat-label">Target</div><div class="goal-stat-value">'+fmt$(g.target)+'</div></div>'
          +'<div class="goal-stat"><div class="goal-stat-label">Remaining</div><div class="goal-stat-value" style="color:var(--red);">'+fmt$(remaining)+'</div></div>'
          +'<div class="goal-stat"><div class="goal-stat-label">Per Check</div><div class="goal-stat-value" style="color:var(--yellow);">'+(perCheck?fmt$(perCheck):'—')+'</div></div>'
        +'</div>'
      +'</div>'
      +'<div class="goal-detail" id="goal-detail-'+g.id+'" style="display:none;">'
        +'<div style="font-size:8px;color:var(--mid);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Contribution Log</div>'
        +'<div class="goal-contrib-list">'+contribHtml+'</div>'
        +'<div class="goal-add-form">'
          +'<input class="goal-add-input" id="gc-amount-'+g.id+'" type="number" placeholder="Amount ($)" min="0.01" step="0.01">'
          +'<input class="goal-add-input" id="gc-note-'+g.id+'" type="text" placeholder="Note (optional)" style="max-width:140px;">'
          +'<button class="goal-add-btn" onclick="addGoalContrib(\''+g.id+'\')">Add</button>'
        +'</div>'
        +'<div style="display:flex;justify-content:flex-end;">'
          +'<button class="goal-delete-btn" onclick="deleteGoal(\''+g.id+'\')">Delete Goal</button>'
        +'</div>'
      +'</div>';
    listEl.appendChild(card);
  });
}

function toggleGoalExpand(id){
  const card = document.getElementById('goal-card-'+id);
  const detail = document.getElementById('goal-detail-'+id);
  if(!card || !detail) return;
  const open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : 'block';
  if(open) card.classList.remove('expanded');
  else card.classList.add('expanded');
}

// Canonical API: addGoalContribution(goalId, amount, note?, date?)
// Source-of-truth: goal.saved is always recomputed as the sum of all contributions.
// Contributions are the authoritative record; goal.saved is a derived cache.
function addGoalContribution(goalId, amount, note, date){
  const amt = parseFloat(amount);
  if(!amt || amt <= 0) return false;
  const g = state.goals.find(function(x){return x.id===goalId;});
  if(!g) return false;
  const dateStr = date || new Date().toISOString().slice(0,10);
  const cid = 'c-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  g.contributions.push({id:cid, amount:amt, date:dateStr, note:note||''});
  // Recompute from contributions (contributions are the single source of truth for saved)
  g.saved = g.contributions.reduce(function(s,c){return s+(c.amount||0);},0);
  syncGoalBackcompat();
  saveLocal(); syncToSupabase();
  return true;
}

// DOM-coupled wrapper used by inline "Add" button
function addGoalContrib(id){
  const amtEl = document.getElementById('gc-amount-'+id);
  const noteEl = document.getElementById('gc-note-'+id);
  const amt = parseFloat(amtEl ? amtEl.value : 0);
  const note = noteEl ? noteEl.value.trim() : '';
  if(!amt || amt <= 0){ showToast('Enter a valid amount'); return; }
  const ok = addGoalContribution(id, amt, note);
  if(!ok){ showToast('Goal not found'); return; }
  renderGoals();
  setTimeout(function(){ toggleGoalExpand(id); },50);
  showToast('Contribution added');
}

function removeGoalContrib(goalId, contribId){
  const g = state.goals.find(function(x){return x.id===goalId;});
  if(!g) return;
  g.contributions = g.contributions.filter(function(c){return c.id !== contribId;});
  g.saved = g.contributions.reduce(function(s,c){return s+(c.amount||0);},0);
  syncGoalBackcompat();
  saveLocal(); syncToSupabase();
  renderGoals();
  setTimeout(function(){ toggleGoalExpand(goalId); },50);
  showToast('Contribution removed');
}

function deleteGoal(id){
  state.goals = state.goals.filter(function(g){return g.id!==id;});
  syncGoalBackcompat();
  saveLocal(); syncToSupabase();
  renderGoals();
  showToast('Goal deleted');
}

function showNewGoalForm(){
  const f = document.getElementById('new-goal-form');
  if(f){ f.style.display='block'; document.getElementById('ng-name').focus(); }
}

function hideNewGoalForm(){
  const f = document.getElementById('new-goal-form');
  if(f){
    f.style.display='none';
    document.getElementById('ng-name').value='';
    document.getElementById('ng-target').value='';
    document.getElementById('ng-date').value='';
    document.getElementById('ng-note').value='';
  }
}

function submitNewGoal(){
  const name = document.getElementById('ng-name').value.trim();
  const target = parseFloat(document.getElementById('ng-target').value);
  const date = document.getElementById('ng-date').value;
  const note = document.getElementById('ng-note').value.trim();
  if(!name){ showToast('Enter a goal name'); return; }
  if(!target || target <= 0){ showToast('Enter a valid target amount'); return; }
  if(!date){ showToast('Enter a target date'); return; }
  const id = 'goal-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  state.goals.push({id:id, name:name, target:target, saved:0, targetDate:date, note:note, contributions:[]});
  syncGoalBackcompat();
  hideNewGoalForm();
  saveLocal(); syncToSupabase();
  renderGoals();
  showToast('Goal added');
}

// ══════════════════════════════════════════════════════════
// HOURS CALCULATOR
// ══════════════════════════════════════════════════════════
function renderShifts(){
  const body=document.getElementById('calc-body');
  body.innerHTML='';
  if(!state.shifts.length) addShiftRow();

  const rate=parseFloat(document.getElementById('hourly-rate').value)||state.hourlyRate;
  let bestPay=0, shiftCount=0;

  const shiftRowStyle=[
    'display:grid;grid-template-columns:70px 50px 50px 60px 70px 1fr 28px;',
    'align-items:center;padding:8px 14px;',
    'border-bottom:1px solid #191919;',
    'transition:background 0.1s;'
  ].join('');

  state.shifts.forEach(function(shift,i){
    const hours=calcShiftHours(shift.start,shift.end);
    const pay=hours!==null?hours*rate:null;
    if(pay!==null){ if(pay>bestPay) bestPay=pay; shiftCount++; }
    const div=document.createElement('div');
    div.style.cssText=shiftRowStyle;
    div.onmouseenter=function(){this.style.background='#141414';};
    div.onmouseleave=function(){this.style.background='';};

    const payColor=pay!==null?'#22c55e':'#444';
    const hoursColor=hours!==null?'#aaa':'#333';
    div.innerHTML=
      '<input value="'+(shift.date||'')+'" placeholder="4/15" onchange="updateShift('+i+',\'date\',this.value)" style="background:transparent;border:none;outline:none;color:#666;font-family:\'DM Mono\',monospace;font-size:10px;width:100%;cursor:text;">'+
      '<input type="number" value="'+(shift.start||'')+'" placeholder="11" onchange="updateShift('+i+',\'start\',this.value)" style="background:transparent;border:none;outline:none;color:#aaa;font-family:\'DM Mono\',monospace;font-size:11px;width:44px;">'+
      '<input type="number" value="'+(shift.end||'')+'" placeholder="7" onchange="updateShift('+i+',\'end\',this.value)" style="background:transparent;border:none;outline:none;color:#aaa;font-family:\'DM Mono\',monospace;font-size:11px;width:44px;">'+
      '<span style="font-family:\'DM Mono\',monospace;font-size:11px;color:'+hoursColor+';">'+(hours!==null?hours.toFixed(2):'—')+'</span>'+
      '<span style="font-family:\'Syne\',sans-serif;font-size:12px;font-weight:700;color:'+payColor+';">'+(pay!==null?'$'+pay.toFixed(2):'—')+'</span>'+
      '<input value="'+(shift.note||'')+'" placeholder="Notes..." onchange="updateShift('+i+',\'note\',this.value)" style="background:transparent;border:none;outline:none;color:#444;font-family:\'DM Mono\',monospace;font-size:9px;width:100%;">'+
      '<span style="cursor:pointer;color:#333;font-size:13px;text-align:center;user-select:none;" onclick="removeShift('+i+')" onmouseenter="this.style.color=\'#888\'" onmouseleave="this.style.color=\'#333\'">×</span>';
    body.appendChild(div);
  });

  const totalHours=state.shifts.reduce(function(s,sh){const h=calcShiftHours(sh.start,sh.end);return s+(h||0);},0);
  const totalPay=totalHours*rate;
  const avgHours=shiftCount>0?totalHours/shiftCount:0;

  // Goals
  const primaryGoal=(state.goals&&state.goals.length)?state.goals[0]:null;
  const goalTarget=primaryGoal?primaryGoal.target:(state.goal||0);
  const goalSaved=primaryGoal?primaryGoal.saved:0;
  const goalRemaining=Math.max(0,goalTarget-goalSaved);
  const hoursNeeded=rate>0?Math.ceil(goalRemaining/rate):0;
  const goalPct=goalTarget>0?Math.min(100,Math.round((goalSaved/goalTarget)*100)):0;

  // Update hero stats
  const totalPayEl=document.getElementById('total-pay');
  const totalHrsEl=document.getElementById('total-hours');
  if(totalPayEl) totalPayEl.textContent='$'+totalPay.toFixed(2);
  if(totalHrsEl) totalHrsEl.textContent=totalHours.toFixed(2);

  // Goal bar
  const barEl=document.getElementById('goal-bar-fill');
  const pctEl=document.getElementById('goal-pct-label');
  if(barEl) barEl.style.width=goalPct+'%';
  if(pctEl) pctEl.textContent=goalPct+'%';

  // Extra stats
  const extraEl=document.getElementById('calc-extra-stats');
  if(extraEl){
    extraEl.innerHTML=
      '<div class="calc-stat"><div class="calc-stat-label">Avg Hours/Shift</div><div class="calc-stat-value">'+avgHours.toFixed(2)+'</div></div>'+
      '<div class="calc-stat"><div class="calc-stat-label">Best Shift Pay</div><div class="calc-stat-value" style="color:#22c55e;">$'+bestPay.toFixed(2)+'</div></div>'+
      '<div class="calc-stat"><div class="calc-stat-label">Hours to Goal</div><div class="calc-stat-value" style="color:#facc15;">'+hoursNeeded+'</div></div>';
  }

  // Update AI context
  const ctxHours=document.getElementById('ctx-hours');
  const ctxPay=document.getElementById('ctx-pay');
  const ctxRate=document.getElementById('ctx-rate');
  if(ctxHours) ctxHours.textContent=totalHours.toFixed(2);
  if(ctxPay) ctxPay.textContent='$'+totalPay.toFixed(2);
  if(ctxRate) ctxRate.textContent='$'+rate.toFixed(2)+'/hr';
}

function addShiftRow(){ state.shifts.push({date:'',start:'',end:''});saveLocal();renderShifts(); }
function removeShift(i){ state.shifts.splice(i,1);saveLocal();renderShifts(); }
function updateShift(i,field,val){ state.shifts[i][field]=val;saveLocal();renderShifts(); }
function recalcShifts(){ state.hourlyRate=parseFloat(document.getElementById('hourly-rate').value)||10.75;saveLocal();renderShifts(); }

function sendPayToBudget(){
  const rate=parseFloat(document.getElementById('hourly-rate').value)||state.hourlyRate;
  const totalHours=state.shifts.reduce(function(s,sh){const h=calcShiftHours(sh.start,sh.end);return s+(h||0);},0);
  const pay=Math.round(totalHours*rate*100)/100;
  if(pay<=0){ showToast('No pay to send — add shift hours first'); return; }

  const now=new Date();
  now.setHours(0,0,0,0);
  const rpm=getRowsPerMonth();
  const freq=state.payFrequency||'bimonthly';
  const mNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let m=now.getMonth();
  let rowIdx=0;

  if(freq==='biweekly'){
    const allDates=getBiweeklyPayDates();
    const yr=new Date((state.biweeklyAnchorDate||'2026-01-02')+'T00:00:00').getFullYear();
    const nextPay=allDates.find(function(d){return d>=now;})||allDates[allDates.length-1];
    m=nextPay.getMonth();
    const inMonth=allDates.filter(function(d){return d.getMonth()===m&&d.getFullYear()===nextPay.getFullYear();});
    rowIdx=inMonth.findIndex(function(d){return d.getTime()===nextPay.getTime();});
    if(rowIdx<0||rowIdx>=rpm) rowIdx=0;
  } else if(freq==='bimonthly'){
    rowIdx=now.getDate()>=15?1:0;
  } else if(freq==='weekly'){
    rowIdx=Math.min(Math.floor((now.getDate()-1)/7),rpm-1);
  }

  const absIdx=m*rpm+rowIdx;
  if(absIdx<0||absIdx>=state.budgetRows.length){showToast('Budget row not found');return;}
  const row=state.budgetRows[absIdx];
  if(row.check){ showToast('Row already has income ($'+row.check+'). Add shifts to a new row first.'); return; }
  row.check=pay;
  saveLocal(); renderAll(); syncToSupabase();
  showToast('$'+pay.toFixed(2)+' sent to '+mNames[m]+' period '+(rowIdx+1));
}

// ══════════════════════════════════════════════════════════
// BUDGET DECIDER
// ══════════════════════════════════════════════════════════
let _billEditIdx=null;
let _billAddFormOpen=false;

function toggleBillEdit(i){
  _billEditIdx=(_billEditIdx===i)?null:i;
  renderDecider();
}

function saveBillEdit(i){
  const nameEl=document.getElementById('bedit-name-'+i);
  const amtEl=document.getElementById('bedit-amt-'+i);
  const dueEl=document.getElementById('bedit-due-'+i);
  const catEl=document.getElementById('bedit-cat-'+i);
  const name=(nameEl?nameEl.value:'').trim();
  const amt=parseFloat(amtEl?amtEl.value:0);
  const due=(dueEl?dueEl.value:'1st').trim()||'1st';
  const cat=(catEl?catEl.value:'Other')||'Other';
  if(!name){showToast('Bill name required');return;}
  state.bills[i].name=name;
  state.bills[i].amount=isNaN(amt)?0:amt;
  state.bills[i].due=due;
  state.bills[i].cat=cat;
  _billEditIdx=null;
  saveLocal();renderDecider();syncToSupabase();
}

function toggleBillActive(i){
  state.bills[i].active=!(state.bills[i].active);
  saveLocal();renderDecider();syncToSupabase();
}

function markBillPaid(i){
  if(!state.billsPaid) state.billsPaid=[];
  const period=getCurrentPeriod();
  const billId=state.bills[i].id;
  const idx=state.billsPaid.findIndex(function(p){return p.billId===billId&&p.period===period;});
  if(idx>=0) state.billsPaid.splice(idx,1);
  else state.billsPaid.push({billId:billId,period:period,paidAt:new Date().toISOString()});
  saveLocal();renderDecider();syncToSupabase();
}

function showAddBillForm(){
  _billAddFormOpen=true;
  renderDecider();
  setTimeout(function(){var el=document.getElementById('badd-name');if(el)el.focus();},50);
}

function cancelAddBill(){
  _billAddFormOpen=false;
  renderDecider();
}

function submitNewBill(){
  const nameEl=document.getElementById('badd-name');
  const amtEl=document.getElementById('badd-amt');
  const dueEl=document.getElementById('badd-due');
  const catEl=document.getElementById('badd-cat');
  const name=(nameEl?nameEl.value:'').trim();
  const amt=parseFloat(amtEl?amtEl.value:0);
  const due=(dueEl?dueEl.value:'1st').trim()||'1st';
  const cat=(catEl?catEl.value:'Other')||'Other';
  if(!name){showToast('Bill name required');return;}
  const id='bill-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
  state.bills.push({id:id,name:name,amount:isNaN(amt)?0:amt,due:due,cat:cat,active:true});
  _billAddFormOpen=false;
  saveLocal();renderDecider();syncToSupabase();
  showToast('Bill added');
}

function renderDeciderBills(){
  const list=document.getElementById('bills-list');
  list.innerHTML='';
  const period=getCurrentPeriod();

  state.bills.forEach(function(bill,i){
    const isPaid=(state.billsPaid||[]).some(function(p){return p.billId===bill.id&&p.period===period;});
    const isEditing=(_billEditIdx===i);
    const isActive=(bill.active!==false);
    const catOptions=['Essential','Business','Subscription','Other'].map(function(c){
      return '<option value="'+c+'"'+(bill.cat===c?' selected':'')+'>'+c+'</option>';
    }).join('');

    const div=document.createElement('div');
    div.className='bill-item'+(isEditing?' editing':'')+(!isActive?' inactive':'')+(isPaid?' paid-period':'');
    div.innerHTML=
      '<div class="bill-item-header">'+
        '<div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;">'+
          '<div class="bill-pill-toggle '+(isActive?'on':'off')+'" onclick="toggleBillActive('+i+')" title="'+(isActive?'Active':'Inactive')+'"></div>'+
          '<div style="min-width:0;cursor:pointer;" onclick="toggleBillEdit('+i+')" title="Click to edit">'+
            '<div class="bill-name" style="display:flex;align-items:center;gap:5px;">'+
              (isPaid?'<span class="bill-paid-check">&#10003;</span>':'')+
              escHtml(bill.name)+
            '</div>'+
            '<div style="font-size:9px;color:var(--mid);">'+escHtml(bill.due)+' &middot; '+escHtml(bill.cat)+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">'+
          '<div class="bill-amount" style="'+(isActive?'':'color:var(--mid);')+'">'+(isActive?'-$':'$')+parseFloat(bill.amount||0).toFixed(2)+'</div>'+
          '<button class="bill-paid-btn'+(isPaid?' paid':'')+'" onclick="markBillPaid('+i+')">'+(isPaid?'Paid':'Mark Paid')+'</button>'+
          '<button style="background:none;border:1px solid #374151;border-radius:4px;color:'+(isEditing?'var(--white)':'var(--mid)')+';cursor:pointer;padding:2px 7px;font-size:9px;font-family:\'DM Mono\',monospace;" onclick="toggleBillEdit('+i+')">'+(isEditing?'Cancel':'Edit')+'</button>'+
          '<button style="background:none;border:none;color:var(--mid);cursor:pointer;font-size:15px;line-height:1;padding:0 2px;" onclick="removeBill('+i+')" title="Remove">&times;</button>'+
        '</div>'+
      '</div>'+
      (isEditing?
        '<div class="bill-edit-fields">'+
          '<div><div class="bill-cat-label">Name</div>'+
          '<input class="bill-edit-input" id="bedit-name-'+i+'" type="text" value="'+escHtml(bill.name)+'" placeholder="Bill name"></div>'+
          '<div><div class="bill-cat-label">Amount ($)</div>'+
          '<input class="bill-edit-input" id="bedit-amt-'+i+'" type="number" min="0" step="0.01" value="'+parseFloat(bill.amount||0).toFixed(2)+'"></div>'+
          '<div><div class="bill-cat-label">Due Date</div>'+
          '<input class="bill-edit-input" id="bedit-due-'+i+'" type="text" value="'+escHtml(bill.due)+'" placeholder="1st, 15th..."></div>'+
          '<div><div class="bill-cat-label">Category</div>'+
          '<select class="bill-edit-input" id="bedit-cat-'+i+'">'+catOptions+'</select></div>'+
          '<div style="grid-column:span 2;display:flex;gap:8px;margin-top:4px;">'+
            '<button class="btn" style="padding:5px 16px;font-size:10px;" onclick="saveBillEdit('+i+')">Save</button>'+
            '<button class="btn btn-ghost" style="padding:5px 14px;font-size:10px;" onclick="toggleBillEdit('+i+')">Cancel</button>'+
          '</div>'+
        '</div>'
      :'');
    list.appendChild(div);
  });

  // inline add-bill form
  if(_billAddFormOpen){
    const addDiv=document.createElement('div');
    addDiv.innerHTML=
      '<div class="bill-add-form">'+
        '<div style="font-size:9px;color:var(--mid);text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">New Bill</div>'+
        '<div class="bill-add-grid">'+
          '<div><div class="bill-cat-label">Name</div>'+
          '<input class="bill-edit-input" id="badd-name" type="text" placeholder="e.g. Netflix"></div>'+
          '<div><div class="bill-cat-label">Amount ($)</div>'+
          '<input class="bill-edit-input" id="badd-amt" type="number" min="0" step="0.01" placeholder="0.00"></div>'+
          '<div><div class="bill-cat-label">Due Date</div>'+
          '<input class="bill-edit-input" id="badd-due" type="text" value="1st" placeholder="1st, 15th..."></div>'+
          '<div><div class="bill-cat-label">Category</div>'+
          '<select class="bill-edit-input" id="badd-cat">'+
            '<option>Essential</option><option>Business</option>'+
            '<option>Subscription</option><option selected>Other</option>'+
          '</select></div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;">'+
          '<button class="btn" style="padding:5px 16px;font-size:10px;" onclick="submitNewBill()">Add Bill</button>'+
          '<button class="btn btn-ghost" style="padding:5px 14px;font-size:10px;" onclick="cancelAddBill()">Cancel</button>'+
        '</div>'+
      '</div>';
    list.appendChild(addDiv);
  }
}

function renderDecider(){
  const avgIncome=getAvgMonthlyIncome();
  const totalBills=getTotalBills();
  const ratio=totalBills>0?avgIncome/totalBills:0;

  document.getElementById('dec-income').textContent='$'+avgIncome.toFixed(2);
  document.getElementById('dec-bills').textContent='$'+totalBills.toFixed(2);
  document.getElementById('dec-need').textContent='$'+(totalBills*2).toFixed(2);

  const vbox=document.getElementById('verdict-box');
  const vtxt=document.getElementById('verdict-text');
  if(!avgIncome){
    vbox.className='verdict-box covered';
    vtxt.textContent='Enter budget data to see verdict';
  } else if(ratio>=2){
    vbox.className='verdict-box covered';
    vtxt.textContent='COVERED — Income is '+ratio.toFixed(2)+'x your bills. You\'re good.';
  } else if(ratio>=1.2){
    vbox.className='verdict-box tight';
    vtxt.textContent='TIGHT — Income is '+ratio.toFixed(2)+'x bills. Cut non-essentials.';
  } else {
    vbox.className='verdict-box short';
    vtxt.textContent='SHORT — Income doesn\'t cover bills. Pause optional spend.';
  }

  renderDeciderBills();

  const leftAfter=avgIncome-totalBills;
  const monthly=Math.max(0,leftAfter-50);
  const annual=monthly*12;
  document.getElementById('savings-guide').innerHTML=`
    <div class="card">
      <div style="font-size:9px;color:var(--mid);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Left After Bills</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:var(--green);">$${leftAfter.toFixed(2)}</div>
      <div style="font-size:9px;color:var(--mid);">per month</div>
    </div>
    <div class="card">
      <div style="font-size:9px;color:var(--mid);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Monthly Savings</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:var(--yellow);">$${monthly.toFixed(2)}</div>
      <div style="font-size:9px;color:var(--mid);">keeping extras &lt; $50</div>
    </div>
    <div class="card">
      <div style="font-size:9px;color:var(--mid);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Annual Savings</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:var(--green);">$${annual.toFixed(2)}</div>
      <div style="font-size:9px;color:var(--mid);">if consistent</div>
    </div>
  `;

  document.getElementById('ctx-bills').innerHTML=state.bills.map(b=>`
    <div class="context-item">
      <span class="context-key">${b.name.replace(/[^\x20-\x7E]/g,'').trim()||b.name}</span>
      <span class="context-val" style="color:var(--red);">-$${b.amount}</span>
    </div>
  `).join('');
}

function addBill(){ showAddBillForm(); }
function removeBill(i){ if(_billEditIdx===i) _billEditIdx=null; state.bills.splice(i,1);saveLocal();renderDecider();syncToSupabase(); }
function updateBill(i,val){ state.bills[i].amount=parseFloat(val)||0;saveLocal();renderDecider();syncToSupabase(); }

// ══════════════════════════════════════════════════════════
// ── FINANCIAL AI TOOL SYSTEM ──
//
// Real backend-connected functions for the AI to call.
// All connect to Supabase database.
// ══════════════════════════════════════════════════════════

/**
 * mapDateToPayPeriod(dateStr)
 * Returns {month:0-11, rowIdx:0|1} based on which paycheck period the date falls in.
 * Days 1-14 → row 0 (1st check), days 15-31 → row 1 (2nd check).
 */
function mapDateToPayPeriod(dateStr){
  let d = dateStr ? new Date(dateStr) : new Date();
  if(isNaN(d)) d = new Date();
  const month = d.getMonth();
  const day = d.getDate();
  const freq = state.payFrequency || 'bimonthly';
  let rowIdx = 0;
  if(freq === 'monthly'){
    rowIdx = 0;
  } else if(freq === 'weekly'){
    if(day <= 7) rowIdx = 0;
    else if(day <= 14) rowIdx = 1;
    else if(day <= 21) rowIdx = 2;
    else rowIdx = 3;
  } else {
    rowIdx = day < 15 ? 0 : 1;
  }
  return { month, rowIdx };
}

/**
 * addExpenseToBudgetRow(amount, description, month, rowIdx)
 * Adds an expense amount to the correct budget row and appends
 * the description to the "where" field. Called automatically by addExpense.
 */
function addExpenseToBudgetRow(amount, description, month, rowIdx){
  const rpm = getRowsPerMonth();
  if(!state.budgetRows || state.budgetRows.length < 12 * rpm) return;
  const idx = month * rpm + rowIdx;
  const row = state.budgetRows[idx];
  const current = parseFloat(row.expenses) || 0;
  const added = parseFloat(amount) || 0;
  row.expenses = (current + added).toFixed(2);
  if(description){
    const existing = row.where ? row.where.trim() : '';
    row.where = existing ? existing + ', ' + description : description;
  }
  saveLocal();
  renderAll();
  syncToSupabase();
}

/**
 * quickAddExpense()
 * Reads the quick-add form fields, validates them, routes the expense
 * to the correct budget row via mapDateToPayPeriod, and shows a toast.
 * No AI is involved.
 */
function quickAddExpense(){
  const amountRaw = document.getElementById('qa-amount').value;
  const desc = document.getElementById('qa-desc').value.trim();
  const catEl = document.getElementById('qa-cat');
  const cat = catEl ? (catEl.value || 'Other') : 'Other';
  const dateVal = document.getElementById('qa-date').value;

  const amount = parseFloat(amountRaw);
  if(!amountRaw || isNaN(amount) || amount <= 0){
    showToast('Please enter a valid amount greater than 0.');
    return;
  }

  const { month, rowIdx } = mapDateToPayPeriod(dateVal || null);
  addExpenseToBudgetRow(amount, desc||cat, month, rowIdx);

  // Also log into the tracked expenses array with category
  const id = 'exp-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
  if(!state.expenses) state.expenses = [];
  state.expenses.push({id, amount, category: cat, description: desc||cat, date: dateVal||new Date().toISOString().slice(0,10), source:'manual'});
  saveLocal(); syncToSupabase();

  const checkLabel = rowIdx === 0 ? '1st check' : '2nd check';
  const MONTHS_QA = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  showToast(`Added $${amount.toFixed(2)} (${cat}) to ${MONTHS_QA[month]} ${checkLabel} row`);

  document.getElementById('qa-amount').value = '';
  document.getElementById('qa-desc').value = '';
  if(catEl) catEl.value = '';
}

/**
 * quickAddCheck()
 * Reads the quick-add check form fields, validates them, routes the check
 * to the correct budget row via mapDateToPayPeriod, and shows a toast.
 */
function quickAddCheck(){
  const amountRaw = document.getElementById('qc-amount').value;
  const dateVal = document.getElementById('qc-date').value;

  const amount = parseFloat(amountRaw);
  if(!amountRaw || isNaN(amount) || amount <= 0){
    showToast('Please enter a valid check amount greater than 0.');
    return;
  }

  const rpm = getRowsPerMonth();
  const { month, rowIdx } = mapDateToPayPeriod(dateVal || null);
  if(!state.budgetRows || state.budgetRows.length < 12 * rpm){
    showToast('Budget rows not initialized. Please restart the app.');
    return;
  }
  const idx = month * rpm + rowIdx;
  const row = state.budgetRows[idx];
  const current = parseFloat(row.check) || 0;
  row.check = (current + amount).toFixed(2);

  saveLocal();
  renderAll();
  syncToSupabase();

  const freq = state.payFrequency || 'bimonthly';
  const MONTHS_QC = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let rowLabel;
  if(freq==='monthly') rowLabel='month';
  else if(freq==='weekly') rowLabel='Week '+(rowIdx+1);
  else if(freq==='biweekly') rowLabel=rowIdx===0?'Check 1':'Check 2';
  else rowLabel=rowIdx===0?'1st check':'2nd check';
  showToast(`Logged $${amount.toFixed(2)} check to ${MONTHS_QC[month]} ${rowLabel} row`);

  document.getElementById('qc-amount').value = '';
  document.getElementById('qc-date').value = '';
}

/**
 * addExpense(amount, category, description, date)
 * Logs a new expense to state.expenses and Supabase.
 */
async function addExpense(amount, category, description, date){
  const expense = {
    id: Date.now().toString(),
    amount: parseFloat(amount),
    category: category || 'Uncategorized',
    description: description || '',
    date: date || new Date().toLocaleDateString(),
    source: 'ai',
    createdAt: new Date().toISOString()
  };
  if(!state.expenses) state.expenses = [];
  state.expenses.push(expense);

  // Auto-route to the correct budget row based on the expense date
  const { month, rowIdx } = mapDateToPayPeriod(expense.date);
  const checkLabel = rowIdx === 0 ? '1st' : '2nd';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  addExpenseToBudgetRow(expense.amount, expense.description || expense.category, month, rowIdx);

  // Persist to Supabase expenses table (create this table in your Supabase project)
  try {
    await fetch(`${SB_URL}/rest/v1/expenses`, {
      method:'POST',
      headers:{
        'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({
        user_id: getSupabaseRowId(),
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        date: expense.date,
        source: expense.source
      })
    });
  } catch(e){}

  showToast(`Budget updated: +$${expense.amount} → ${MONTHS[month]} ${checkLabel} check row`, 'success');
  return `Expense added: $${expense.amount} — ${expense.category} · ${expense.description} (→ ${MONTHS[month]} ${checkLabel} check on budget)`;
}

/**
 * updateIncome(amount, source, date)
 * Logs income to state.incomeLog and Supabase.
 */
async function updateIncome(amount, source, date){
  const income = {
    id: Date.now().toString(),
    amount: parseFloat(amount),
    source: source || 'Work',
    date: date || new Date().toLocaleDateString(),
    createdAt: new Date().toISOString()
  };
  if(!state.incomeLog) state.incomeLog = [];
  state.incomeLog.push(income);
  saveLocal();
  renderAll();
  syncToSupabase();

  try {
    await fetch(`${SB_URL}/rest/v1/income_log`, {
      method:'POST',
      headers:{
        'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({
        user_id: getSupabaseRowId(),
        amount: income.amount,
        source: income.source,
        date: income.date
      })
    });
  } catch(e){}

  return `Income logged: $${income.amount} from ${income.source}`;
}

/**
 * analyzeSpending()
 * Returns a formatted analysis of spending patterns.
 */
function analyzeSpending(){
  const {totalIncome, totalExpenses, totalNet} = getTotals();
  const months = getMonthlyData();
  const activeMonths = months.filter(m=>m.income>0);
  const avgMonthly = getAvgMonthlyIncome();
  const totalBills = getTotalBills();
  const savingsRate = totalIncome>0 ? Math.round(((totalIncome-totalExpenses)/totalIncome)*100) : 0;

  // Category breakdown from expenses
  const catMap = {};
  (state.expenses||[]).forEach(e=>{
    catMap[e.category]=(catMap[e.category]||0)+e.amount;
  });
  const topCategories = Object.entries(catMap)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,3)
    .map(([k,v])=>`${k}: $${v.toFixed(2)}`);

  const result = {
    totalIncome: totalIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    totalNet: totalNet.toFixed(2),
    savingsRate: savingsRate+'%',
    avgMonthlyIncome: avgMonthly.toFixed(2),
    totalBills: totalBills.toFixed(2),
    topExpenseCategories: topCategories,
    monthsActive: activeMonths.length,
    goalProgress: state.goal ? Math.round((totalNet/state.goal)*100)+'%' : '0%',
    verdict: totalNet >= state.goal ? 'Goal Hit' : totalNet > 0 ? 'Positive' : 'Negative',
  };

  // Update scheduled job tracker
  state.scheduledJobs.lastAnalysis = new Date().toLocaleTimeString();
  const _jlr=document.getElementById('job-last-run'); if(_jlr) _jlr.textContent=state.scheduledJobs.lastAnalysis;
  saveLocal();

  return JSON.stringify(result, null, 2);
}

/**
 * categorizeTransaction(description, amount)
 * AI-driven categorization using keyword matching + heuristics.
 */
function categorizeTransaction(description, amount){
  const desc = (description||'').toLowerCase();
  const categories = {
    'Food & Dining':     ['food','restaurant','pizza','burger','mcdonalds','subway','starbucks','coffee','lunch','dinner','breakfast','grocery','groceries','walmart','target','kroger'],
    'Transportation':    ['gas','fuel','uber','lyft','car','parking','transit','bus','train','toll'],
    'Business':          ['shopify','squarespace','adobe','notion','software','subscription','domain','hosting'],
    'Health':            ['pharmacy','cvs','walgreens','doctor','medical','health','gym','fitness'],
    'Entertainment':     ['netflix','spotify','hulu','disney','gaming','xbox','playstation','steam'],
    'Clothing':          ['fashion','clothing','shoes','nike','adidas','amazon','zara','h&m'],
    'Bills & Utilities': ['phone','electric','water','internet','insurance','rent','bill'],
    'Education':         ['course','udemy','coursera','book','textbook','school','tuition'],
  };

  for(const [cat, keywords] of Object.entries(categories)){
    if(keywords.some(kw => desc.includes(kw))){
      return { category: cat, confidence: 'high', amount };
    }
  }

  // Amount-based heuristics
  const amt = parseFloat(amount)||0;
  if(amt > 200) return { category: 'Large Purchase', confidence: 'low', amount };
  if(amt < 15)  return { category: 'Small Purchase', confidence: 'low', amount };

  return { category: 'Uncategorized', confidence: 'low', amount };
}

/**
 * scanEmails()
 * Simulates email scanning. Real implementation requires Gmail OAuth.
 * See Settings → Connected Tools → Email for setup instructions.
 */
async function scanEmails(){
  if(!state.connectedTools.email){
    return 'Email not connected. Enable it in Settings → Connected Tools.';
  }

  /*
    REAL GMAIL INTEGRATION:
    ──────────────────────────────────────────────────────────
    const accessToken = state.gmailToken; // OAuth access token
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=receipt+OR+invoice+OR+purchase+is:unread',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    const messages = data.messages || [];

    for(const msg of messages.slice(0,10)){
      const detail = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await detail.json();
      // Parse headers for subject, from, date
      // Parse body for dollar amounts using regex matching
      // Call categorizeTransaction() on each match
      // Call addExpense() for confirmed transactions
    }
    ──────────────────────────────────────────────────────────
  */

  state.scheduledJobs.lastEmailScan = new Date().toLocaleTimeString();
  const _jlre=document.getElementById('job-last-run'); if(_jlre) _jlre.textContent=state.scheduledJobs.lastEmailScan;
  saveLocal();

  return 'Email scan complete. 0 new transactions found. (Connect Gmail in Settings to enable real scanning.)';
}

/**
 * extractReceiptData(imageBase64)
 * Extracts vendor, amount, date, and items from a receipt image.
 * Uses AI vision (Anthropic claude-3-haiku) or placeholder parsing.
 */
async function extractReceiptData(imageBase64){
  const key = state.anthropicKey || AI_KEY_DEFAULT;

  if(!key){
    return {
      vendor: 'Unknown',
      amount: 0,
      date: new Date().toLocaleDateString(),
      items: [],
      note: 'Add Anthropic API key in Settings to enable AI receipt extraction.'
    };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'x-api-key': key,
        'anthropic-version':'2023-06-01',
        'content-type':'application/json'
      },
      body: JSON.stringify({
        model:'claude-3-haiku-20240307',
        max_tokens:500,
        messages:[{
          role:'user',
          content:[
            {type:'image', source:{type:'base64', media_type:'image/jpeg', data: imageBase64}},
            {type:'text', text:'Extract: vendor name, total amount, date, and list of items. Return JSON only: {vendor, amount, date, items:[{name,price}]}'}
          ]
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if(match) return JSON.parse(match[0]);
    return {vendor:'Parse error', amount:0, date:'', items:[]};
  } catch(e){
    return {vendor:'Error', amount:0, date:'', items:[], error:e.message};
  }
}

// ══════════════════════════════════════════════════════════
// SPREADSHEET IMPORT (CSV / Excel → Budget Rows, no AI needed)
// ══════════════════════════════════════════════════════════

function triggerSheetUpload(){
  document.getElementById('import-sheet-file').click();
}

function triggerSheetUploadInline(){
  document.getElementById('inline-sheet-file').click();
}

function handleSheetImportInline(input){
  const file = input.files[0];
  if(!file) return;
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      let headers, dataRows;
      if(isCSV){
        const rows = parseCSVRows(e.target.result);
        if(rows.length<2){ showToast('File seems empty','error'); return; }
        headers = rows[0]; dataRows = rows.slice(1);
      } else {
        if(typeof XLSX==='undefined'){ showToast('Excel library not loaded yet — try CSV','error'); return; }
        const wb = XLSX.read(e.target.result,{type:'binary',cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const all = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        if(all.length<2){ showToast('File seems empty','error'); return; }
        headers = all[0].map(String); dataRows = all.slice(1);
      }
      const mapped = mapSheetRows(headers, dataRows);
      if(!mapped.length){ showToast("No rows matched — check column headers",'error'); return; }
      window._pendingSheetImport = mapped;
      showSheetImportModal(mapped);
    } catch(err){
      showToast('Could not read file: '+err.message,'error');
    }
  };
  isCSV ? reader.readAsText(file) : reader.readAsBinaryString(file);
  input.value = '';
}

function showSheetImportModal(rows){
  let modal = document.getElementById('sheet-import-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'sheet-import-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(modal);
  }
  const expenses = rows.filter(r=>!r.isIncome);
  const incomes  = rows.filter(r=>r.isIncome);
  const preview8 = rows.slice(0,8).map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:5px 0;border-bottom:1px solid #1a1a1a;">
      <span style="color:var(--mid);min-width:72px;">${r.date}</span>
      <span style="color:var(--off);flex:1;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.description||'—'}</span>
      <span style="color:${r.isIncome?'#22c55e':'#ef4444'};min-width:64px;text-align:right;">${r.isIncome?'+':'-'}$${r.amount.toFixed(2)}</span>
    </div>`).join('');
  modal.innerHTML=`
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;">
      <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:var(--white);margin-bottom:4px;">Import Spreadsheet</div>
      <div style="font-size:10px;color:var(--mid);margin-bottom:16px;">Found <strong style="color:var(--white);">${rows.length}</strong> rows — <span style="color:#ef4444;">${expenses.length} expenses</span> · <span style="color:#22c55e;">${incomes.length} income</span></div>
      <div style="background:#161616;border-radius:8px;padding:10px;margin-bottom:16px;max-height:220px;overflow-y:auto;">${preview8}${rows.length>8?`<div style="font-size:9px;color:var(--mid);padding-top:6px;">…and ${rows.length-8} more</div>`:''}</div>
      <button onclick="confirmSheetImportInline()" style="width:100%;padding:12px;background:var(--white);color:#000;border:none;border-radius:8px;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;margin-bottom:8px;">
        Import ${rows.length} rows into Budget
      </button>
      <button onclick="document.getElementById('sheet-import-modal').style.display='none'" style="width:100%;padding:10px;background:transparent;color:var(--mid);border:1px solid #2a2a2a;border-radius:8px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;">
        Cancel
      </button>
    </div>`;
  modal.style.display='flex';
}

function confirmSheetImportInline(){
  const rows = window._pendingSheetImport;
  if(!rows||!rows.length) return;
  const groups = {};
  rows.forEach(r=>{
    const key=`${r.month}-${r.rowIdx}`;
    if(!groups[key]) groups[key]={month:r.month,rowIdx:r.rowIdx,expenses:0,income:0,descs:[]};
    if(r.isIncome){ groups[key].income+=r.amount; }
    else { groups[key].expenses+=r.amount; if(r.description) groups[key].descs.push(r.description); }
  });
  Object.values(groups).forEach(g=>{
    const row = state.budgetRows[g.month*getRowsPerMonth()+g.rowIdx];
    if(!row) return;
    if(g.expenses>0){
      const cur = parseFloat(row.expenses)||0;
      row.expenses = (cur+g.expenses).toFixed(2);
      const label = g.descs.slice(0,3).join(', ');
      row.where = row.where ? row.where+', '+label : label;
    }
    if(g.income>0){
      const cur = parseFloat(row.check)||0;
      row.check = (cur+g.income).toFixed(2);
    }
  });
  saveLocal(); renderAll(); syncToSupabase();
  window._pendingSheetImport = null;
  document.getElementById('sheet-import-modal').style.display='none';
  showToast(`Imported ${rows.length} rows into budget`,'success');
  showPage('budget');
}

function parseCSVRows(text){
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const result = []; let cur = ''; let inQ = false;
    for(let i=0;i<line.length;i++){
      const c = line[i];
      if(c==='"'){ inQ=!inQ; }
      else if(c===','&&!inQ){ result.push(cur.trim().replace(/^"|"$/g,'')); cur=''; }
      else { cur+=c; }
    }
    result.push(cur.trim().replace(/^"|"$/g,''));
    return result;
  });
}

function parseFlexDate(val){
  if(!val && val!==0) return null;
  if(typeof val==='number'){
    const d = new Date((val-25569)*86400*1000);
    if(!isNaN(d)) return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  const d = new Date(s);
  if(!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

function detectSheetColumns(headers){
  const lh = headers.map(h=>String(h).toLowerCase().replace(/[^a-z0-9]/g,''));
  const find=(...terms)=>{
    for(const t of terms){ const i=lh.findIndex(h=>h.includes(t)); if(i!==-1) return i; }
    return -1;
  };
  return {
    dateCol:    find('date','datetime','transactiondate','paydate','postdate'),
    amountCol:  find('amount','total','sum','value','cost','price','debit','spend'),
    descCol:    find('description','desc','memo','merchant','vendor','where','category','notes','name','business','narrative'),
    typeCol:    find('type','transactiontype','creditdebit','direction','flowtype'),
    incomeCol:  find('income','credit','inflow','deposit'),
    expenseCol: find('expense','debit','outflow','withdrawal')
  };
}

function mapSheetRows(headers, rows){
  const { dateCol, amountCol, descCol, typeCol, incomeCol, expenseCol } = detectSheetColumns(headers);
  const mapped = [];
  for(const row of rows){
    if(!row || row.every(c=>!String(c).trim())) continue;
    const dateVal = dateCol!==-1 ? row[dateCol] : null;
    const date = parseFlexDate(dateVal);
    if(!date) continue;
    let rawAmt = '';
    if(amountCol!==-1) rawAmt = row[amountCol];
    else if(incomeCol!==-1 && row[incomeCol]) rawAmt = row[incomeCol];
    else if(expenseCol!==-1 && row[expenseCol]) rawAmt = row[expenseCol];
    const amount = parseFloat(String(rawAmt).replace(/[$,\s()]/g,'').replace(/\((.+)\)/,'−$1'));
    if(isNaN(amount)||amount===0) continue;
    const desc = descCol!==-1 ? String(row[descCol]).trim() : '';
    const typeVal = typeCol!==-1 ? String(row[typeCol]).toLowerCase() : '';
    let isIncome = amount > 0 && !typeVal.includes('debit') && !typeVal.includes('expense') && !typeVal.includes('outflow');
    if(typeVal.includes('credit')||typeVal.includes('income')||typeVal.includes('deposit')) isIncome = true;
    if(typeVal.includes('debit')||typeVal.includes('expense')||typeVal.includes('withdrawal')) isIncome = false;
    if(incomeCol!==-1 && row[incomeCol] && amountCol===-1) isIncome = true;
    if(expenseCol!==-1 && row[expenseCol] && amountCol===-1) isIncome = false;
    const { month, rowIdx } = mapDateToPayPeriod(date);
    mapped.push({ date, amount: Math.abs(amount), description: desc, isIncome, month, rowIdx });
  }
  return mapped;
}

function handleSheetImport(input){
  const file = input.files[0];
  if(!file) return;
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      let headers, dataRows;
      if(isCSV){
        const rows = parseCSVRows(e.target.result);
        if(rows.length<2){ showToast('File seems empty','error'); return; }
        headers = rows[0]; dataRows = rows.slice(1);
      } else {
        if(typeof XLSX==='undefined'){ showToast('Excel library not loaded yet — try CSV','error'); return; }
        const wb = XLSX.read(e.target.result,{type:'binary',cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const all = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        if(all.length<2){ showToast('File seems empty','error'); return; }
        headers = all[0].map(String); dataRows = all.slice(1);
      }
      const mapped = mapSheetRows(headers, dataRows);
      renderImportPreview(mapped);
    } catch(err){
      showToast('Could not read file: '+err.message,'error');
    }
  };
  isCSV ? reader.readAsText(file) : reader.readAsBinaryString(file);
  input.value = '';
}

function renderImportPreview(rows){
  const previewEl = document.getElementById('import-preview');
  if(!previewEl) return;
  if(!rows||rows.length===0){
    showToast("No rows matched — check your column headers",'error');
    return;
  }
  window._pendingSheetImport = rows;
  const expenses = rows.filter(r=>!r.isIncome);
  const incomes  = rows.filter(r=>r.isIncome);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const preview8 = rows.slice(0,8).map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:5px 0;border-bottom:1px solid #1a1a1a;">
      <span style="color:var(--mid);min-width:70px;">${r.date}</span>
      <span style="color:var(--off);flex:1;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.description||'—'}</span>
      <span style="color:${r.isIncome?'#22c55e':'#ef4444'};min-width:60px;text-align:right;">${r.isIncome?'+':'-'}$${r.amount.toFixed(2)}</span>
    </div>`).join('');
  previewEl.style.display='';
  previewEl.innerHTML=`
    <div style="background:#161616;border:1px solid #1f1f1f;border-radius:10px;padding:14px;margin-top:4px;">
      <div style="font-size:10px;color:var(--off);margin-bottom:10px;">
        Found <strong style="color:var(--white);">${rows.length}</strong> rows —
        <span style="color:#ef4444;">${expenses.length} expenses</span> ·
        <span style="color:#22c55e;">${incomes.length} income</span>
      </div>
      <div style="max-height:180px;overflow-y:auto;">${preview8}${rows.length>8?`<div style="font-size:9px;color:var(--mid);padding-top:6px;">…and ${rows.length-8} more rows</div>`:''}</div>
      <button onclick="confirmSheetImport()" style="margin-top:14px;width:100%;padding:11px;background:var(--white);color:#000;border:none;border-radius:8px;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;">
        Import ${rows.length} rows into Budget
      </button>
    </div>`;
}

function confirmSheetImport(){
  const rows = window._pendingSheetImport;
  if(!rows||!rows.length) return;
  const groups = {};
  rows.forEach(r=>{
    const key=`${r.month}-${r.rowIdx}`;
    if(!groups[key]) groups[key]={month:r.month,rowIdx:r.rowIdx,expenses:0,income:0,descs:[]};
    if(r.isIncome){ groups[key].income+=r.amount; }
    else { groups[key].expenses+=r.amount; if(r.description) groups[key].descs.push(r.description); }
  });
  Object.values(groups).forEach(g=>{
    const row = state.budgetRows[g.month*getRowsPerMonth()+g.rowIdx];
    if(!row) return;
    if(g.expenses>0){
      const cur = parseFloat(row.expenses)||0;
      row.expenses = (cur+g.expenses).toFixed(2);
      const label = g.descs.slice(0,3).join(', ');
      row.where = row.where ? row.where+', '+label : label;
    }
    if(g.income>0){
      const cur = parseFloat(row.check)||0;
      row.check = (cur+g.income).toFixed(2);
    }
  });
  saveLocal(); renderAll(); syncToSupabase();
  window._pendingSheetImport = null;
  showToast(`Imported ${rows.length} rows into budget`,'success');
  finishOnboarding();
}

// ── CSV → AI Analysis ──
function triggerCSVUpload(){
  document.getElementById('csv-ai-upload').click();
}

async function parseCSVForAI(input){
  const file = input.files[0];
  if(!file) return;
  input.value = '';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const rows = text.split('\n').filter(l => l.trim());
    if(rows.length < 2){ addMessage('CSV appears empty or unreadable.','ai'); return; }

    let imported = 0;
    const txList = [];

    for(const row of rows.slice(1)){
      const cols = row.split(',').map(c => c.trim().replace(/"/g,''));
      if(cols.length < 3) continue;
      const date  = cols[0];
      const desc  = cols[1] || '';
      const amtStr = cols[2] || '0';
      const amt   = parseFloat(amtStr.replace(/[^0-9.-]/g,''));
      if(!amt || amt <= 0) continue;
      const cat = categorizeTransaction(desc, amt);
      await addExpense(amt, cat.category, desc, date);
      txList.push({ date, desc, amt, cat: cat.category });
      imported++;
    }

    if(imported === 0){
      addMessage('No transactions found. Make sure this is a Cash App CSV export (Date, Description, Amount columns).','ai');
      return;
    }

    const total   = txList.reduce((s,t) => s + t.amt, 0);
    const topRows = txList.slice(0,12).map(t => `• ${t.date} — ${t.desc} ($${t.amt.toFixed(2)}, ${t.cat})`).join('\n');
    const cats    = {};
    txList.forEach(t => { cats[t.cat] = (cats[t.cat]||0) + t.amt; });
    const catSummary = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: $${v.toFixed(2)}`).join(', ');

    showToast('Imported '+imported+' Cash App transactions');
    updateAIContext();
    renderDashboard();
    saveLocal();

    const prompt = `I just uploaded my Cash App CSV. Here is a summary of my ${imported} transactions totaling $${total.toFixed(2)}:\n\nTop categories: ${catSummary}\n\nSample transactions:\n${topRows}\n\nPlease analyze my spending patterns, flag anything I should watch out for, and give me 2–3 specific, actionable tips based on these numbers.`;

    const chatInput = document.getElementById('chat-input');
    chatInput.value = prompt;
    sendMessage();
  };
  reader.readAsText(file);
}

// ── Cash App CSV Parser ──
function parseCashAppCSV(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split('\n').filter(l=>l.trim());
    let imported = 0;
    for(const line of lines.slice(1)){ // Skip header
      const cols = line.split(',').map(c=>c.trim().replace(/"/g,''));
      if(cols.length < 3) continue;
      const date = cols[0];
      const desc = cols[1] || '';
      const amtStr = cols[2] || '0';
      const amt = parseFloat(amtStr.replace(/[^0-9.-]/g,''));
      if(!amt || amt <= 0) continue;
      const cat = categorizeTransaction(desc, amt);
      await addExpense(amt, cat.category, desc, date);
      imported++;
    }
    showToast(`Imported ${imported} Cash App transactions`);
    closeToolModal();
  };
  reader.readAsText(file);
}

// ── Receipt upload ──
function triggerReceiptUpload(){
  document.getElementById('receipt-input').click();
}

async function handleReceiptUpload(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    addMessage('Scanning receipt...', 'system');
    const result = await extractReceiptData(base64);
    const msg = result.error
      ? `Receipt scan error: ${result.error}`
      : `Receipt found:\n• Vendor: ${result.vendor}\n• Amount: $${result.amount}\n• Date: ${result.date}\n\nShould I log this as an expense?`;
    addMessage(msg, 'ai');

    if(result.amount > 0 && !result.error){
      window._pendingReceipt = result;
      addMessage('Reply "yes" to log it, or edit the details above.', 'system');
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// ── Run from toolbar ──
async function runAnalyzeSpending(){
  const analysis = analyzeSpending();
  addMessage('Running spending analysis...', 'system');
  const data = JSON.parse(analysis);
  const msg = `Spending analysis complete:\n• Income: $${data.totalIncome}\n• Expenses: $${data.totalExpenses}\n• Net: $${data.totalNet}\n• Savings rate: ${data.savingsRate}\n• Goal progress: ${data.goalProgress}\n• Top categories: ${data.topExpenseCategories.join(', ')||'No data yet'}`;
  addMessage(msg, 'ai');
}

async function runEmailScan(){
  addMessage('Scanning emails...', 'system');
  const result = await scanEmails();
  addMessage(result, 'ai');
}

// ── Daily AI Analysis (scheduled) ──
async function runDailyAnalysis(){
  const key = state.anthropicKey || AI_KEY_DEFAULT;
  const ctx = getBudgetContext();
  const insightEl = document.getElementById('ai-insight-text');
  if(insightEl) insightEl.textContent = 'Generating insight...';

  if(!key){
    if(insightEl) insightEl.textContent = 'Add Anthropic API key in Settings to enable AI daily insights.';
    return;
  }

  const prompt = `Give a single sharp financial insight (2 sentences max) for ${ctx.userName}:
Income: $${ctx.totalIncome.toFixed(2)}, Expenses: $${ctx.totalExpenses.toFixed(2)}, Net: $${ctx.totalNet.toFixed(2)}, Goal: ${ctx.goalProgress}%, Bills: $${ctx.totalBills}/mo`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},
      body: JSON.stringify({model:'claude-3-haiku-20240307',max_tokens:100,messages:[{role:'user',content:prompt}]})
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || 'Unable to generate insight.';
    if(insightEl) insightEl.textContent = text;
    state.scheduledJobs.lastAnalysis = new Date().toLocaleString();
    saveLocal();
  } catch(e){
    if(insightEl) insightEl.textContent = 'Could not reach AI service. Check your API key.';
  }
}

// ══════════════════════════════════════════════════════════
// SCHEDULED JOBS
// (Front-end scheduling — runs while tab is open)
// For true server-side scheduling, deploy cron jobs on Railway
// that call these endpoints:
//   POST /api/scan-emails   (4× per day = every 6 hrs)
//   POST /api/analyze       (1× per day)
//   POST /api/deep-analyze  (1× per week)
// ══════════════════════════════════════════════════════════
let scheduledJobTimers = [];

function startScheduledJobs(){
  // Clear existing
  scheduledJobTimers.forEach(t=>clearInterval(t));
  scheduledJobTimers = [];

  // Email scan: 4× per day = every 6 hours (in ms)
  const emailInterval = 6 * 60 * 60 * 1000;
  scheduledJobTimers.push(setInterval(async ()=>{
    const result = await scanEmails();
    console.log('[Scheduled] Email scan:', result);
    const _jes=document.getElementById('job-email-status'); if(_jes) _jes.textContent='Just ran';
    setTimeout(()=>{ if(document.getElementById('job-email-status')) document.getElementById('job-email-status').textContent='4×/day'; }, 5000);
  }, emailInterval));

  // AI analysis: 1× per day = every 24 hours
  const analysisInterval = 24 * 60 * 60 * 1000;
  scheduledJobTimers.push(setInterval(async ()=>{
    await runDailyAnalysis();
    const _jas=document.getElementById('job-analysis-status'); if(_jas) _jas.textContent='Just ran';
    setTimeout(()=>{ if(document.getElementById('job-analysis-status')) document.getElementById('job-analysis-status').textContent='1×/day'; }, 5000);
  }, analysisInterval));

  // Deep analysis: 1× per week = every 7 days
  const deepInterval = 7 * 24 * 60 * 60 * 1000;
  scheduledJobTimers.push(setInterval(()=>{
    console.log('[Scheduled] Deep analysis — run full trend report');
    state.scheduledJobs.lastDeepAnalysis = new Date().toLocaleString();
    const _jds=document.getElementById('job-deep-status'); if(_jds) _jds.textContent='Just ran';
    setTimeout(()=>{ if(document.getElementById('job-deep-status')) document.getElementById('job-deep-status').textContent='Weekly'; }, 5000);
    saveLocal();
  }, deepInterval));

  // Run daily analysis on load (debounced)
  setTimeout(runDailyAnalysis, 3000);
}

// ══════════════════════════════════════════════════════════
// AI CHAT — UPGRADED WITH TOOL ORCHESTRATION
// ══════════════════════════════════════════════════════════
function getBudgetContext(){
  const {totalIncome,totalExpenses,totalNet}=getTotals();
  const avgMonthly=getAvgMonthlyIncome();
  const totalBills=getTotalBills();
  const months=getMonthlyData();
  const activeMonths=months.filter(m=>m.income>0);
  const rate=parseFloat(document.getElementById('hourly-rate')?.value)||state.hourlyRate;
  const totalHours=state.shifts.reduce((s,sh)=>{const h=calcShiftHours(sh.start,sh.end);return s+(h||0);},0);
  const catMap={};
  (state.expenses||[]).forEach(e=>{catMap[e.category]=(catMap[e.category]||0)+e.amount;});

  return {
    totalIncome, totalExpenses, totalNet,
    goal: state.goal,
    goalProgress: state.goal?Math.round((totalNet/state.goal)*100):0,
    avgMonthlyIncome: avgMonthly,
    monthsActive: activeMonths.length,
    currentMonthStatus: (()=>{ const _rpm=getRowsPerMonth(),_m=new Date().getMonth(),_rows=Array.from({length:_rpm},(_,i)=>state.budgetRows[_m*_rpm+i]||{}); const _inc=_rows.reduce((s,r)=>s+(parseFloat(r.check)||0),0),_exp=_rows.reduce((s,r)=>s+(parseFloat(r.expenses)||0),0); return !_rows.some(r=>r.check)?'N/A':(_inc-_exp)<0?'Bad':_exp>=_inc*0.8&&_exp>0?'Light':'Good'; })(),
    totalBills, needForCovered: totalBills*2,
    billsVsIncome: avgMonthly>0?(totalBills/avgMonthly*100).toFixed(0)+'%':'N/A',
    hourlyRate: rate,
    totalHoursWorked: totalHours.toFixed(2),
    billsList: state.bills.map(b=>`${b.name}: $${b.amount}/mo`).join(', '),
    savingsRate: totalIncome>0?Math.round(((totalIncome-totalExpenses)/totalIncome)*100)+'%':'0%',
    userName: state.userName||'Dane',
    connectedTools: Object.keys(state.connectedTools||{}).filter(k=>state.connectedTools[k]).join(', ')||'none',
    trackedExpenses: (state.expenses||[]).length,
    expenseCategories: Object.entries(catMap).map(([k,v])=>`${k}:$${v.toFixed(0)}`).join(', ')||'none',
  };
}

function getSystemPrompt(){
  const ctx=getBudgetContext();
  const personalities={
    professional:'You are a direct, professional financial adviser. Concise, data-first.',
    friendly:'You are a warm, encouraging financial coach who celebrates wins.',
    strict:'You are a strict, no-nonsense financial adviser. Blunt and direct.',
    mentor:'You are a mentor who teaches financial concepts while advising.'
  };
  const focuses={
    saving:'Focus especially on saving money and building the savings rate.',
    spending:'Focus especially on spending habits and expense reduction.',
    goals:'Focus especially on hitting income and savings goals.',
    balanced:'Give a balanced view of income, spending, savings, and goals.'
  };

  // Current month stats
  const mIdx=new Date().getMonth();
  const rpm=getRowsPerMonth();
  const mRows=Array.from({length:rpm},function(_,i){return state.budgetRows[mIdx*rpm+i]||{};});
  const mInc=mRows.reduce(function(s,r){return s+(parseFloat(r.check)||0);},0);
  const mExp=mRows.reduce(function(s,r){return s+(parseFloat(r.expenses)||0);},0);
  const mNet=mInc-mExp;
  const mMonthName=new Date().toLocaleString('default',{month:'long'});

  // Goals summary
  const goalsInfo=(state.goals&&state.goals.length)?state.goals.map(function(g){
    const rem=Math.max(0,g.target-g.saved);
    const pct=g.target>0?Math.round((g.saved/g.target)*100):0;
    const hoursNeeded=state.hourlyRate>0?Math.ceil(rem/state.hourlyRate):0;
    return g.name+': $'+g.saved.toFixed(2)+' / $'+g.target.toFixed(2)+' ('+pct+'%, $'+rem.toFixed(2)+' remaining, ~'+hoursNeeded+' hrs to go)';
  }).join('; '):'No goals set.';

  // Recent expenses (last 5)
  const recentExp=(state.expenses&&state.expenses.length)?state.expenses.slice(-5).map(function(e){
    return '$'+e.amount+' '+e.category+' ('+e.note+') on '+e.date;
  }).join('; '):'No recent expenses.';

  const bioBlock = (state.userBio && state.userBio.trim()) ? `\nABOUT THIS USER:\n${state.userBio.trim()}\n` : '';
  const recentExpBlock = state.privacyAI===false ? '' : `\nRECENT EXPENSES (last 5):\n${recentExp}`;

  return `${personalities[state.aiPersonality]||personalities.professional}
Your name is ${state.aiName}. You are advising ${ctx.userName} (age 16, self-employed hourly worker).${bioBlock}

YEARLY FINANCIAL DATA:
- Total Income (YTD): $${ctx.totalIncome.toFixed(2)}
- Total Expenses (YTD): $${ctx.totalExpenses.toFixed(2)}
- Net (YTD): $${ctx.totalNet.toFixed(2)}
- Savings Rate: ${ctx.savingsRate}
- Avg Monthly Income: $${ctx.avgMonthlyIncome.toFixed(2)}
- Hourly Rate: $${ctx.hourlyRate}/hr · Hours Worked: ${ctx.totalHoursWorked}hrs
- Fixed Monthly Bills: $${ctx.totalBills} (${ctx.billsVsIncome} of income)
- Bills: ${ctx.billsList}
- Tracked Expense Categories: ${ctx.expenseCategories}

THIS MONTH (${mMonthName}):
- Income: $${mInc.toFixed(2)}
- Expenses: $${mExp.toFixed(2)}
- Net: ${mNet>=0?'+$':'−$'}${Math.abs(mNet).toFixed(2)}
- Status: ${ctx.currentMonthStatus}

SAVINGS GOALS:
${goalsInfo}

${recentExpBlock}

AVAILABLE TOOLS (use when the user requests an action):
- addExpense(amount, category, description, date) — log a new expense AND auto-add it to the correct budget row (1st-14th → 1st check, 15th-31st → 2nd check). ALWAYS include the date.
- addToBudget(amount, description, date) — route an expense/bill directly to the right paycheck row.
- updateIncome(amount, source) — log new income.
- updateGoal(goalName, newSaved) — update saved amount for a named goal.
- analyzeSpending() — full spending breakdown.
- categorizeTransaction(description, amount) — classify a transaction.
- scanEmails() — scan for receipt emails.
- extractReceiptData(image) — read receipt photos.

When performing a tool action, respond with:
[TOOL:toolName:arg1:arg2:arg3]
on its own line, then briefly explain what you did.

${focuses[state.aiFocus]||focuses.balanced}
Be concise and specific to their exact numbers. Keep answers to 3-5 sentences unless more detail is asked for.`;
}

// Parse and execute tool calls from AI response
async function executeToolCalls(text){
  const toolRegex = /\[TOOL:(\w+):([^\]]*)\]/g;
  let match;
  const results = [];
  let cleanText = text;

  while((match = toolRegex.exec(text)) !== null){
    const toolName = match[1];
    const args = match[2].split(':').map(a=>a.trim());
    let result = '';

    try {
      switch(toolName){
        case 'addExpense':
          result = await addExpense(args[0], args[1], args[2], args[3]);
          break;
        case 'addToBudget':
          result = await addExpense(args[0], 'Budget', args[1], args[2]);
          break;
        case 'updateIncome':
          result = await updateIncome(args[0], args[1], args[2]);
          break;
        case 'analyzeSpending':
          result = analyzeSpending();
          break;
        case 'categorizeTransaction':
          result = JSON.stringify(categorizeTransaction(args[0], args[1]));
          break;
        case 'scanEmails':
          result = await scanEmails();
          break;
        case 'updateGoal':{
          const gName=args[0]||'';
          const gNewSaved=parseFloat(args[1])||0;
          const gMatch=state.goals&&state.goals.find(function(g){return g.name.toLowerCase()===gName.toLowerCase();});
          if(gMatch){
            gMatch.saved=gNewSaved;
            syncGoalBackcompat();
            saveLocal();
            syncToSupabase();
            renderAll();
            result='Updated goal "'+gMatch.name+'" saved amount to $'+gNewSaved.toFixed(2)+'.';
          } else {
            result='Goal not found: '+gName+'. Available: '+(state.goals?state.goals.map(function(g){return g.name;}).join(', '):'none');
          }
          break;
        }
        default:
          result = `Unknown tool: ${toolName}`;
      }
    } catch(e){
      result = `Tool error: ${e.message}`;
    }

    results.push({tool: toolName, result});
    cleanText = cleanText.replace(match[0], '').trim();
  }

  return { cleanText, results };
}

/**
 * tryLocalCommand(message)
 * Regex-based parser that intercepts simple expense/income commands
 * and handles them locally without needing an API key.
 * Returns { handled: true, reply: '...' } or { handled: false }
 */
async function tryLocalCommand(message){
  const msg = message.trim();

  // Helper: parse a natural-language date string into a JS Date
  function parseNaturalDate(dateStr){
    if(!dateStr) return new Date();
    const MONTHS = {
      jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
      january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,
      september:8,october:9,november:10,december:11
    };
    // "April 3rd", "April 3", "Apr 3"
    const mdy = dateStr.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/i);
    if(mdy){
      const mo = MONTHS[mdy[1].toLowerCase()];
      if(mo !== undefined){
        const yr = mdy[3] ? parseInt(mdy[3]) : new Date().getFullYear();
        return new Date(yr, mo, parseInt(mdy[2]));
      }
    }
    // "3rd April", "3 April"
    const dmy = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?/i);
    if(dmy){
      const mo = MONTHS[dmy[2].toLowerCase()];
      if(mo !== undefined){
        const yr = dmy[3] ? parseInt(dmy[3]) : new Date().getFullYear();
        return new Date(yr, mo, parseInt(dmy[1]));
      }
    }
    const d = new Date(dateStr);
    return isNaN(d) ? new Date() : d;
  }

  function formatDateForExpense(d){
    return d.toLocaleDateString();
  }

  function friendlyDate(d){
    const opts = { month:'long', day:'numeric' };
    return d.toLocaleDateString('en-US', opts);
  }

  // ---------- INCOME PATTERNS (checked first to avoid conflicts with expense patterns) ----------
  // "I got paid $800"
  // "log $1200 income"
  // "add income $500"
  // "received $2000 from freelance"
  // "income $900"
  const incomePatterns = [
    /^(?:i\s+(?:got\s+)?paid|received|got)\s+\$?([\d,.]+)(?:\s+(?:from\s+)?(.+))?$/i,
    /^(?:log|add)\s+\$?([\d,.]+)\s+income(?:\s+(?:from\s+)?(.+))?$/i,
    /^(?:log|add)\s+income\s+\$?([\d,.]+)(?:\s+(?:from\s+)?(.+))?$/i,
    /^income\s+\$?([\d,.]+)(?:\s+(?:from\s+)?(.+))?$/i
  ];

  for(const pat of incomePatterns){
    const m = msg.match(pat);
    if(m){
      const rawAmount = m[1].replace(/,/g,'');
      const amount = parseFloat(rawAmount);
      if(isNaN(amount) || amount <= 0) continue;
      const source = (m[2] || 'Work').trim();
      await updateIncome(amount, source, null);
      const confirmations = [
        `Nice! I've logged $${amount.toFixed(2)} income from ${source}. Your income records have been updated.`,
        `Got it — $${amount.toFixed(2)} from ${source} has been added to your income log.`,
        `Logged $${amount.toFixed(2)} income from ${source}. Your records are up to date!`
      ];
      const reply = confirmations[Math.floor(Math.random()*confirmations.length)];
      return { handled: true, reply };
    }
  }

  // ---------- EXPENSE PATTERNS ----------
  // "add $120 groceries April 3rd"
  // "add $15.99 Netflix"
  // "log $50 gas on April 5"
  // "$30 for coffee"
  // "spent $45 on dinner"
  // "I spent $45 on dinner"
  const expensePatterns = [
    /^(?:add|log)\s+\$?([\d,.]+)\s+(.+?)(?:\s+(?:on\s+)?([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?))?$/i,
    /^\$?([\d,.]+)\s+(?:for|on)\s+(.+?)(?:\s+(?:on\s+)?([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?))?$/i,
    /^(?:i\s+)?spent\s+\$?([\d,.]+)\s+(?:on\s+)?(.+?)(?:\s+(?:on\s+)?([a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?))?$/i
  ];

  for(const pat of expensePatterns){
    const m = msg.match(pat);
    if(m){
      const rawAmount = m[1].replace(/,/g,'');
      const amount = parseFloat(rawAmount);
      if(isNaN(amount) || amount <= 0) continue;
      const description = m[2].trim().replace(/\s+(?:on\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}.*$/i,'').trim();
      const dateStr = m[3] || null;
      const d = parseNaturalDate(dateStr);
      const dateFormatted = formatDateForExpense(d);
      const dateDisplay = dateStr ? friendlyDate(d) : 'today';
      await addExpense(amount, 'Expense', description, dateFormatted);
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const { month, rowIdx } = mapDateToPayPeriod(dateFormatted);
      const checkLabel = rowIdx === 0 ? '1st' : '2nd';
      const confirmations = [
        `Got it! I've logged $${amount.toFixed(2)} for ${description} on ${dateDisplay} and routed it to your ${MONTHS[month]} ${checkLabel} check budget row.`,
        `Done! $${amount.toFixed(2)} for ${description} (${dateDisplay}) has been added and applied to your ${MONTHS[month]} ${checkLabel} check budget.`,
        `Logged $${amount.toFixed(2)} — ${description} on ${dateDisplay}. Your ${MONTHS[month]} ${checkLabel} check budget row has been updated.`
      ];
      const reply = confirmations[Math.floor(Math.random()*confirmations.length)];
      return { handled: true, reply };
    }
  }

  return { handled: false };
}

// Check for pending receipt confirmation
function checkPendingReceipt(msg){
  if(window._pendingReceipt && /^yes/i.test(msg.trim())){
    const r = window._pendingReceipt;
    addExpense(r.amount, 'Receipt', r.vendor, r.date);
    window._pendingReceipt = null;
    addMessage(`Logged $${r.amount} expense from ${r.vendor}`, 'system');
    return true;
  }
  return false;
}

async function sendMessage(){
  const input=document.getElementById('chat-input');
  const msg=input.value.trim();
  if(!msg) return;

  input.value='';
  input.style.height='36px';

  // Check for receipt confirmation
  if(checkPendingReceipt(msg)) return;

  addMessage(msg,'user');

  const typingDiv=document.createElement('div');
  typingDiv.className='msg ai';
  typingDiv.id='typing-indicator';
  typingDiv.innerHTML='<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
  document.getElementById('chat-messages').appendChild(typingDiv);
  scrollChat();

  // Try local command parser first — no API key needed, doesn't count against guest limit
  const local = await tryLocalCommand(msg);
  if(local.handled){
    typingDiv.remove();
    addMessage(local.reply,'ai');
    return;
  }

  const key = state.anthropicKey || AI_KEY_DEFAULT;

  if(!key){
    typingDiv.remove();
    addMessage(`I can log expenses and income without a key — try saying "add $50 groceries" or "I got paid $800".\n\nFor full AI features like analysis and spending insights, add your Anthropic API key in Settings → App → AI API Key.`,'ai');
    return;
  }

  // Guest AI message limit only applies to real API calls (key is confirmed present here)
  const isOwner = currentUser?.email === OWNER_EMAIL;
  if(!isOwner){
    state.aiMsgCount = state.aiMsgCount||0;
    if(state.aiMsgCount >= GUEST_AI_LIMIT){
      typingDiv.remove();
      addMessage(`You've reached the free limit of ${GUEST_AI_LIMIT} AI messages.`,'ai');
      return;
    }
    state.aiMsgCount++;
    saveLocal();
  }

  try{
    // Build conversation history
    const msgEls = document.querySelectorAll('.msg:not(#typing-indicator):not(.system)');
    const messages = [];
    msgEls.forEach(m=>{
      const role = m.classList.contains('user')?'user':'assistant';
      const text = m.querySelector('.msg-bubble')?.textContent||'';
      if(text && messages.length < 20) messages.push({role, content: text});
    });
    messages.push({role:'user', content: msg});

    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'content-type':'application/json'
      },
      body:JSON.stringify({
        model:'claude-3-5-haiku-20241022',
        max_tokens:1000,
        system: getSystemPrompt(),
        messages
      })
    });
    const data = await res.json();
    typingDiv.remove();

    if(data.error){
      addMessage('API error: '+data.error.message,'ai');
      return;
    }

    const rawText = data.content?.[0]?.text||'No response.';

    // Parse and execute any tool calls
    const { cleanText, results } = await executeToolCalls(rawText);

    addMessage(cleanText || rawText, 'ai');

    // Show tool results
    results.forEach(r=>{
      const div = document.createElement('div');
      div.className = 'msg ai';
      const isError = r.result.toLowerCase().startsWith('error') || r.result.toLowerCase().startsWith('unknown');
      div.innerHTML = `<div class="tool-result${isError?' error':''}">[${r.tool}] ${r.result}</div>`;
      document.getElementById('chat-messages').appendChild(div);
    });

    scrollChat();
    updateAIContext();
  } catch(e){
    typingDiv?.remove();
    addMessage('Connection error. Check your API key and try again.','ai');
  }
}

function addMessage(text, role){
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg '+role;
  const time = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  div.innerHTML = `<div class="msg-bubble">${text.replace(/\n/g,'<br>')}</div><div class="msg-time">${time}</div>`;
  msgs.appendChild(div);
  scrollChat();
}

function scrollChat(){
  const msgs = document.getElementById('chat-messages');
  if(msgs) msgs.scrollTop = msgs.scrollHeight;
}

function autoGrowChat(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,120)+'px';
}

function quickAsk(q){
  const inp=document.getElementById('chat-input');
  if(inp){ inp.value=q; autoGrowChat(inp); }
  sendMessage();
}

function quickAskAndClose(q){
  closeToolsPopup();
  quickAsk(q);
}

function clearChat(){
  if(!confirm('Clear conversation history?')) return;
  conversationHistory=[];
  const msgs=document.getElementById('chat-messages');
  if(!msgs) return;
  msgs.innerHTML='';
  const welcome=document.createElement('div');
  welcome.className='msg ai';
  welcome.innerHTML='<div class="msg-bubble">Conversation cleared. How can I help you today?</div>';
  msgs.appendChild(welcome);
}

// AI Profile popover
function toggleAIProfile(e){
  e.stopPropagation();
  const pop=document.getElementById('ai-profile-popover');
  if(pop) pop.classList.toggle('open');
}
function closeAIProfile(){
  const pop=document.getElementById('ai-profile-popover');
  if(pop) pop.classList.remove('open');
}

// Tools popup (+ button)
function toggleToolsPopup(e){
  e.stopPropagation();
  const popup=document.getElementById('tools-popup');
  const btn=document.getElementById('chat-plus-btn');
  if(!popup) return;
  const open=popup.classList.toggle('open');
  if(btn) btn.classList.toggle('open', open);
}
function closeToolsPopup(){
  const popup=document.getElementById('tools-popup');
  const btn=document.getElementById('chat-plus-btn');
  if(popup) popup.classList.remove('open');
  if(btn) btn.classList.remove('open');
}

// Collapsible context panel
function toggleContextPanel(){
  const wrap=document.getElementById('ai-wrap');
  const panel=document.getElementById('ai-context-panel');
  const btn=document.getElementById('snapshot-toggle-btn');
  if(!panel) return;
  const open=panel.style.display==='none'||!panel.style.display||panel.style.display==='';
  panel.style.display=open?'flex':'none';
  if(wrap) wrap.classList.toggle('panel-open', open);
  if(btn) btn.classList.toggle('active', open);
  if(open) updateAIContext();
}

// Close popups when clicking outside
document.addEventListener('click', function(){
  closeAIProfile();
  closeToolsPopup();
});

function updateAIContext(){
  const ctx=getBudgetContext();
  function setEl(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}

  // YTD
  setEl('ctx-income','$'+ctx.totalIncome.toFixed(2));
  setEl('ctx-expenses','$'+ctx.totalExpenses.toFixed(2));
  const netSign=ctx.totalNet>=0?'+$':'-$';
  setEl('ctx-net',netSign+Math.abs(ctx.totalNet).toFixed(2));
  setEl('ctx-goal','$'+ctx.goal);
  setEl('ctx-goal-pct',ctx.goalProgress+'%');

  // Current month
  const mIdx=new Date().getMonth();
  const rpm=getRowsPerMonth();
  const mRows=Array.from({length:rpm},function(_,i){return state.budgetRows[mIdx*rpm+i]||{};});
  const mInc=mRows.reduce(function(s,r){return s+(parseFloat(r.check)||0);},0);
  const mExp=mRows.reduce(function(s,r){return s+(parseFloat(r.expenses)||0);},0);
  const mNet=mInc-mExp;
  setEl('ctx-month-income','$'+mInc.toFixed(2));
  setEl('ctx-month-exp','$'+mExp.toFixed(2));
  setEl('ctx-month-net',(mNet>=0?'+$':'-$')+Math.abs(mNet).toFixed(2));

  // Bills in context
  const billsEl=document.getElementById('ctx-bills');
  if(billsEl&&state.bills){
    const active=state.bills.filter(function(b){return b.active;});
    billsEl.innerHTML=active.map(function(b){
      return '<div class="context-item"><span class="context-key">'+b.name+'</span><span class="context-val">$'+parseFloat(b.amount).toFixed(2)+'</span></div>';
    }).join('')||'<div class="context-item" style="color:#444;font-size:9px;">No bills set</div>';
  }
}

// ── AI Initialization ──
function initAI(){
  // Set avatar and name from state
  const avatar = document.getElementById('ai-avatar');
  const nameEl = document.getElementById('ai-display-name');
  const pageTitle = document.getElementById('ai-page-title');
  const welcomeMsg = document.getElementById('welcome-msg');
  const welcomeTime = document.getElementById('welcome-time');

  var aiMono=(state.aiName||'CL').slice(0,2).toUpperCase();
  var aiColor=state.aiAvatar||'#374151';
  if(avatar){avatar.textContent=aiMono;avatar.style.background=aiColor;}
  if(nameEl) nameEl.textContent = state.aiName||'Claude';
  if(pageTitle) pageTitle.textContent = (state.aiName||'AI')+' Adviser';

  const userName = state.userName || currentUser?.name || 'there';
  const greeting = `Hey ${userName} — I'm ${state.aiName}, your financial AI. I have full access to your budget, hours, and bills. Try asking me to add an expense, analyze your spending, or scan your emails for receipts.`;
  if(welcomeMsg) welcomeMsg.textContent = greeting;
  if(welcomeTime) welcomeTime.textContent = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});

  updateAIContext();
}

// ══════════════════════════════════════════════════════════
// VOICE INPUT (Web Speech API)
// ══════════════════════════════════════════════════════════
let recognition = null;
let isListening = false;

function toggleVoice(){
  if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){
    showToast('Voice input not supported in this browser. Try Chrome.');
    return;
  }

  if(isListening){
    recognition?.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = ()=>{
    isListening = true;
    document.getElementById('voice-btn').classList.add('listening');
    showToast('Listening...');
  };

  recognition.onresult = (e)=>{
    const transcript = e.results[0][0].transcript;
    document.getElementById('chat-input').value = transcript;
    sendMessage();
  };

  recognition.onend = ()=>{
    isListening = false;
    document.getElementById('voice-btn').classList.remove('listening');
  };

  recognition.onerror = (e)=>{
    isListening = false;
    document.getElementById('voice-btn').classList.remove('listening');
    showToast('Voice error: '+e.error);
  };

  recognition.start();
}

// ══════════════════════════════════════════════════════════
// SETTINGS UI
// ══════════════════════════════════════════════════════════
function updateAiName(name){
  state.aiName = name || 'Claude';
  document.getElementById('settings-ai-name-display').textContent = state.aiName;
  document.getElementById('settings-ai-name-sub').textContent = state.aiName;
  document.getElementById('ai-display-name').textContent = state.aiName;
  document.getElementById('ai-page-title').textContent = state.aiName+' Adviser';
  document.getElementById('settings-ai-bubble').textContent =
    `Hey — I'm ${state.aiName}, your AI financial adviser. Ask me anything about your budget, spending, or goals.`;
  // Refresh AI monograms in all avatar elements
  var mono=(state.aiName||'CL').slice(0,2).toUpperCase();
  var color=state.aiAvatar||'#374151';
  ['ai-avatar','settings-ai-avatar','ob-ai-logo'].forEach(function(id){
    var e=document.getElementById(id);
    if(e){e.textContent=mono;e.style.background=color;}
  });
  saveSettings();
}

function setAvatar(color, el){
  state.aiAvatar = color;
  var mono = (state.aiName||'CL').slice(0,2).toUpperCase();
  ['ai-avatar','settings-ai-avatar','ob-ai-logo'].forEach(function(id){
    var e=document.getElementById(id);
    if(e){e.textContent=mono;e.style.background=color;}
  });
  // Scope selection toggle to AI avatar color row only (avoid clearing profile picker)
  var aiRow=document.querySelector('.avatar-row:not(#profile-color-row)');
  if(aiRow) aiRow.querySelectorAll('.avatar-opt').forEach(function(o){o.classList.remove('selected');});
  if(el) el.classList.add('selected');
  saveSettings();
}

function setProfileColor(color, el){
  state.avatarColor = color;
  var initial=(state.userName||'D').charAt(0).toUpperCase();
  var spa=document.getElementById('settings-profile-avatar');
  if(spa){spa.textContent=initial;spa.style.background=color;}
  // Update selection state in profile color row only
  var row=document.getElementById('profile-color-row');
  if(row) row.querySelectorAll('.avatar-opt').forEach(function(o){
    var m=o.getAttribute('onclick')&&o.getAttribute('onclick').match(/'(#[0-9a-f]+)'/i);
    o.classList.toggle('selected', m&&m[1]===color);
  });
  saveSettings();
}

function selectPersonalityChip(val, el){
  state.aiPersonality = val;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
  if(el) el.classList.add('selected');
  saveSettings();
}

function toggleAlerts(el){
  el.classList.toggle('on');
  state.alertsEnabled = el.classList.contains('on');
  saveSettings();
}

function toggleAutoSync(el){
  el.classList.toggle('on');
  state.autoSync = el.classList.contains('on');
  saveSettings();
}

function editPersonalInfo(){
  toggleAccountExpand();
  setTimeout(function(){ toggleAccordionRow('personal'); }, 50);
}

function toggleAccountExpand(){
  const panel = document.getElementById('account-expand');
  const card  = document.getElementById('profile-card-toggle');
  if(!panel || !card) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  card.classList.toggle('expanded', !isOpen);
  if(!isOpen) updateSettingsUI();
}

function toggleAccordionRow(key){
  const panel = document.getElementById('panel-'+key);
  const chev  = document.getElementById('chev-'+key);
  if(!panel) return;
  const isOpen = panel.classList.contains('open');
  // Close all other panels
  ['personal','security','privacy'].forEach(function(k){
    const p = document.getElementById('panel-'+k);
    const c = document.getElementById('chev-'+k);
    if(p) p.classList.remove('open');
    if(c) c.classList.remove('open');
  });
  // Toggle the clicked one
  if(!isOpen){
    panel.classList.add('open');
    if(chev) chev.classList.add('open');
  }
}

function syncGoal(){
  const v = parseFloat(document.getElementById('goal-setting')?.value)||1600;
  state.goal = v;
  // Bidirectional mirror: keep first goal's target in sync
  if(state.goals && state.goals.length > 0) state.goals[0].target = v;
  const gi = document.getElementById('goal-input');
  if(gi) gi.value = v;
  saveLocal();
  renderAll();
  syncToSupabase();
}

function syncRate(){
  const v = parseFloat(document.getElementById('rate-setting')?.value)||10.75;
  state.hourlyRate = v;
  const hr = document.getElementById('hourly-rate');
  if(hr) hr.value = v;
  saveLocal();
  renderShifts();
  syncToSupabase();
}

function updateSettingsUI(){
  const sn = document.getElementById('settings-ai-name-display');
  const ai = document.getElementById('ai-name-input');
  const un = document.getElementById('user-name');
  const gs = document.getElementById('goal-setting');
  const rs = document.getElementById('rate-setting');
  const ak = document.getElementById('anthropic-key');
  const af = document.getElementById('ai-focus');
  const sae = document.getElementById('settings-ai-avatar');
  const spe = document.getElementById('settings-profile-name');
  const spe2 = document.getElementById('settings-profile-email');
  const snb = document.getElementById('settings-ai-name-sub');
  const sab = document.getElementById('settings-ai-bubble');

  if(sn) sn.textContent = state.aiName||'Claude';
  if(snb) snb.textContent = state.aiName||'Claude';
  if(ai) ai.value = state.aiName||'Claude';
  if(un) un.value = state.userName||'';
  if(gs) gs.value = state.goal||1600;
  if(rs) rs.value = state.hourlyRate||10.75;
  if(ak) ak.value = state.anthropicKey||'';
  if(af) af.value = state.aiFocus||'balanced';
  var settingsMono=(state.aiName||'CL').slice(0,2).toUpperCase();
  var settingsColor=state.aiAvatar||'#374151';
  if(sae){sae.textContent=settingsMono;sae.style.background=settingsColor;}
  // Profile avatar: initial of user name
  var spa=document.getElementById('settings-profile-avatar');
  if(spa){spa.textContent=(state.userName||'D').charAt(0).toUpperCase();spa.style.background=state.avatarColor||'#7c3aed';}
  if(spe) spe.textContent = state.userName||'Dane';
  if(spe2) spe2.textContent = currentUser?.email||'';
  if(sab) sab.textContent = `Hey — I'm ${state.aiName||'Claude'}, your AI financial adviser.`;

  // Personality chips
  document.querySelectorAll('.chip').forEach(c=>{
    const val = c.getAttribute('onclick')?.match(/'(\w+)'/)?.[1];
    c.classList.toggle('selected', val===state.aiPersonality);
  });

  // AI avatar color options — only within AI adviser section
  var aiRow=document.querySelector('.avatar-row:not(#profile-color-row)');
  if(aiRow) aiRow.querySelectorAll('.avatar-opt').forEach(function(o){
    var m=o.getAttribute('onclick')&&o.getAttribute('onclick').match(/'(#[0-9a-f]+)'/i);
    o.classList.toggle('selected', m&&m[1]===state.aiAvatar);
  });
  // Profile color options — only within profile color row
  var prow=document.getElementById('profile-color-row');
  if(prow) prow.querySelectorAll('.avatar-opt').forEach(function(o){
    var m=o.getAttribute('onclick')&&o.getAttribute('onclick').match(/'(#[0-9a-f]+)'/i);
    o.classList.toggle('selected', m&&m[1]===(state.avatarColor||'#7c3aed'));
  });

  // Connected tools toggles
  const tools = state.connectedTools||{};
  ['email','cashapp','google','receipt'].forEach(t=>{
    const el = document.getElementById('settings-toggle-'+t);
    if(el) el.classList.toggle('on', !!tools[t]);
  });

  // Alert + sync toggles
  const at = document.getElementById('alerts-toggle');
  const st = document.getElementById('sync-toggle');
  if(at) at.classList.toggle('on', state.alertsEnabled!==false);
  if(st) st.classList.toggle('on', state.autoSync!==false);

  // Profile badge
  const badge = document.getElementById('owner-badge');
  if(badge) badge.style.display = currentUser?.isOwner ? 'flex' : 'none';

  // Accordion Personal Info fields
  const piName = document.getElementById('pi-name');
  const piAge  = document.getElementById('pi-age');
  const piEmail= document.getElementById('pi-email');
  const piBio  = document.getElementById('pi-bio');
  if(piName)  piName.value  = state.userName||'';
  if(piAge)   piAge.value   = state.userAge||'';
  if(piEmail) piEmail.value = currentUser?.email||'';
  if(piBio)   piBio.value   = state.userBio||'';

  // Privacy toggles
  const privA = document.getElementById('priv-analytics');
  const privAI = document.getElementById('priv-ai');
  if(privA)  privA.checked  = state.privacyAnalytics !== false;
  if(privAI) privAI.checked = state.privacyAI !== false;
}

// ══════════════════════════════════════════════════════════
// RENDER ALL
// ══════════════════════════════════════════════════════════
function renderAll(){
  renderBudgetTable();
  renderDashboard();
  renderCharts();
  renderGoals();
  renderDecider();
  renderShifts();
  updateSettingsUI();
  updateAIContext();
}

// ══════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════════════════
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const page = document.getElementById('page-'+id);
  if(page) page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.getAttribute('onclick')?.includes("'"+id+"'")) n.classList.add('active');
  });
  // Close mobile more sheet if open
  const moreSheet = document.getElementById('mobile-more-sheet');
  if(moreSheet) moreSheet.classList.remove('open');
  // Sync bottom nav active state
  document.querySelectorAll('.bottom-nav-item').forEach(b=>b.classList.remove('active'));
  // Primary bottom nav pages
  const primaryPages = ['dashboard','budget','goals','ai'];
  if(primaryPages.includes(id)){
    const bnavEl = document.getElementById('bnav-'+id);
    if(bnavEl) bnavEl.classList.add('active');
  } else {
    // Secondary pages (charts, hours, decider, settings) — highlight "More"
    const moreBtn = document.getElementById('bnav-more');
    if(moreBtn) moreBtn.classList.add('active');
  }
  // Re-render charts when switching to those pages
  if(id==='charts') renderCharts();
  if(id==='goals') renderGoals();
  if(id==='decider') renderDecider();
  if(id==='ai') updateAIContext();
}

function toggleMobileMore(forceState){
  const sheet = document.getElementById('mobile-more-sheet');
  if(!sheet) return;
  const isOpen = sheet.classList.contains('open');
  const shouldOpen = forceState !== undefined ? forceState : !isOpen;
  sheet.classList.toggle('open', shouldOpen);
  const moreBtn = document.getElementById('bnav-more');
  if(moreBtn){
    const currentPage = document.querySelector('.page.active')?.id?.replace('page-','');
    const secondaryPages = ['charts','hours','decider','settings'];
    if(shouldOpen || secondaryPages.includes(currentPage)){
      moreBtn.classList.add('active');
    } else {
      moreBtn.classList.remove('active');
    }
  }
}

// ══════════════════════════════════════════════════════════
// DATA MANAGEMENT
// ══════════════════════════════════════════════════════════
function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stck-data-'+new Date().toISOString().split('T')[0]+'.json';
  a.click();
  showToast('Data exported');
}

function importData(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const parsed = JSON.parse(e.target.result);
      state = {...state,...parsed};
      normalizeGoals();
      saveLocal();
      renderAll();
      showToast('Data imported');
    } catch(err){ showToast('Import failed — invalid file'); }
  };
  reader.readAsText(file);
}

function clearData(){
  if(!confirm('Clear ALL data? This cannot be undone.')) return;
  initBudgetRows();
  state.shifts=[];state.bills=[];state.expenses=[];state.incomeLog=[];
  state.aiMsgCount=0;
  saveLocal();
  renderAll();
  showToast('Data cleared');
}

// ══════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════
let toastTimer;
function showToast(msg){
  let t = document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.display='block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.style.display='none'; }, 3000);
}

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', ()=>{
  // Auto-resize chat input
  const chatInput = document.getElementById('chat-input');
  if(chatInput){
    chatInput.addEventListener('input', function(){
      this.style.height='auto';
      this.style.height=Math.min(this.scrollHeight, 100)+'px';
    });
  }

  // Check for existing session
  const storedSession = localStorage.getItem('stck_session');
  if(storedSession){
    try{
      const session = JSON.parse(storedSession);
      if(session.email && session.ts && (Date.now()-session.ts < 7*24*60*60*1000)){
        currentUser = {email: session.email, name: session.name, isOwner: session.email===OWNER_EMAIL, aiMsgCount:0};
        loadLocal();
        if(state.onboardingDone){
          launchApp();
        } else {
          document.getElementById('auth-screen').style.display = 'none';
          document.getElementById('onboard-step1').style.display = 'flex';
        }
        return;
      }
    } catch(e){}
  }

  // Show auth screen
  document.getElementById('auth-screen').style.display = 'flex';
});

// Persist session on login
function saveSession(email, name){
  localStorage.setItem('stck_session', JSON.stringify({email, name, ts: Date.now()}));
}

// Auto-sync every 30 seconds
setInterval(()=>{ if(currentUser && state.autoSync) syncToSupabase(); }, 30000);

// Close mobile more sheet when tapping outside it
document.addEventListener('click', function(e){
  const sheet = document.getElementById('mobile-more-sheet');
  const moreBtn = document.getElementById('bnav-more');
  if(sheet && sheet.classList.contains('open')){
    if(!sheet.contains(e.target) && e.target !== moreBtn && !moreBtn?.contains(e.target)){
      toggleMobileMore(false);
    }
  }
});