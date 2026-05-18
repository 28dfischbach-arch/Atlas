/* ── State ── */
var mode       = 'split';
var sbView     = 'tree';
var sbOpen     = true;
var splitFiles = {};      /* path -> string content (data:URI for images) */
var curFile    = null;
var srcHtml    = '';
var srcName    = 'source.html';
var appName    = 'my-app';
var errors     = [];
var collapsed  = {};

var prevOn     = true;    /* persistent across mode switches */
var minifyOn   = false;   /* minify combined HTML on download */

var currentPreviewPath = 'index.html'; /* track what is currently showing in the preview frame */

var detectedTabs = [];
var tabSelected  = {};
var tabFileMap   = {};
var extraFiles   = [];
var splitWarnings = [];

var combFiles  = {};
var combResult = '';
var extraImgs  = {};

var aiOpen = false;
var aiChat = [{ from: 'bot', text: "Hi — I'm a simulated assistant. Ask me about errors, splitting, combining, or how to download." }];

/* ════════════════════════════════════
   LANDING / MODE
════════════════════════════════════ */
function enterMode(m) {
  mode = m;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').classList.add('on');
  updateTabs();
  applyMode();
}

function updateTabs() {
  document.getElementById('tabSplit').className   = 'tb-mode' + (mode === 'split'   ? ' on' : '');
  document.getElementById('tabCombine').className = 'tb-mode' + (mode === 'combine' ? ' on' : '');
}

function applyMode() {
  var sd = Object.keys(splitFiles).length > 0;
  var cd = Object.keys(combFiles).length  > 0;
  hide('splitIn'); hide('splitEd'); hide('combIn'); hide('combEd');
  var hasFiles = (mode === 'split' && sd) || (mode === 'combine' && cd);
  // Hide activity bar + sidebar when no files loaded yet — show only the upload screen
  var actBar = document.querySelector('.act-bar');
  var sidebar = document.getElementById('sidebar');
  if (actBar)  actBar.style.display  = hasFiles ? '' : 'none';
  if (sidebar) sidebar.style.display = hasFiles ? '' : 'none';
  if (mode === 'split') {
    if (sd) { flex('splitEd'); refreshPreview(); } else { flex('splitIn'); }
  } else {
    if (cd) { flex('combEd'); refreshCombPreview(); } else { flex('combIn'); }
  }
  applyPreviewState();
  refreshSB();
  refreshFoot();
}

/* ════════════════════════════════════
   SIDEBAR
════════════════════════════════════ */
function toggleSB(view) {
  if (sbView === view && sbOpen) {
    sbOpen = false;
    document.getElementById('sidebar').classList.add('shut');
  } else {
    sbView  = view;
    sbOpen  = true;
    document.getElementById('sidebar').classList.remove('shut');
  }
  document.getElementById('sbHead').textContent = sbView === 'source' ? 'Source File' : 'Explorer';
  refreshActBtns();
  refreshSB();
}

function refreshActBtns() {
  document.getElementById('actExplorer').className = 'act-btn' + (sbView === 'tree'   && sbOpen ? ' on' : '');
  document.getElementById('actSource').className   = 'act-btn' + (sbView === 'source' && sbOpen ? ' on' : '');
}

function refreshSB() {
  if (!sbOpen) return;
  if (sbView === 'source') { renderSrcView(); return; }
  if (mode === 'split') {
    if (Object.keys(splitFiles).length === 0) { sbEmpty(); return; }
    showEl('treeEl'); hide('sbEmpty'); hide('srcEl');
    renderSplitTree();
    renderErrors();
  } else {
    if (Object.keys(combFiles).length === 0) { sbEmpty(); return; }
    showEl('treeEl'); hide('sbEmpty'); hide('srcEl');
    renderCombTree();
    hide('errPanel');
  }
}

function sbEmpty() { showEl('sbEmpty'); hide('treeEl'); hide('srcEl'); hide('errPanel'); }

function refreshFoot() {
  var sd = Object.keys(splitFiles).length > 0;
  var cd = Object.keys(combFiles).length  > 0;
  document.getElementById('sbFoot').style.display = (sd || cd) ? '' : 'none';
  vis('dlZip',    mode === 'split'   && sd);
  vis('rstSplit', mode === 'split'   && sd);
  vis('dlHtml',   mode === 'combine' && cd);
  vis('rstComb',  mode === 'combine' && cd);
}

/* ════════════════════════════════════
   PREVIEW TOGGLE (shared)
════════════════════════════════════ */
function togglePreview() {
  prevOn = !prevOn;
  applyPreviewState();
  if (prevOn) { refreshPreview(); refreshCombPreview(); }
}

function applyPreviewState() {
  var s1 = document.getElementById('edSplit');
  var s2 = document.getElementById('cEdSplit');
  if (s1) s1.classList.toggle('has-prev', prevOn);
  if (s2) s2.classList.toggle('has-prev', prevOn);
  var b1 = document.getElementById('prevBtn');
  var b2 = document.getElementById('cPrevBtn');
  if (b1) b1.className = 'btn btn-o btn-sm prev-toggle' + (prevOn ? ' on' : '');
  if (b2) b2.className = 'btn btn-o btn-sm prev-toggle' + (prevOn ? ' on' : '');
  var mb = document.getElementById('cMinBtn');
  if (mb) mb.className = 'btn btn-o btn-sm prev-toggle' + (minifyOn ? ' on' : '');
}

function toggleMinify() {
  minifyOn = !minifyOn;
  applyPreviewState();
}

/* Conservative HTML minifier — safe to run on full documents.
   Strips comments, collapses whitespace between tags, and minifies <style>/<script> bodies. */
function minifyHtml(html) {
  /* protect <pre> and <textarea> bodies so their whitespace stays intact */
  var stash = [];
  function protect(re) {
    html = html.replace(re, function(m) { stash.push(m); return '\u0000PROT' + (stash.length - 1) + '\u0000'; });
  }
  protect(/<pre\b[\s\S]*?<\/pre>/gi);
  protect(/<textarea\b[\s\S]*?<\/textarea>/gi);

  /* minify <style> bodies */
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, function(_m, attrs, body) {
    var min = body
      .replace(/\/\*[\s\S]*?\*\//g, '')           // strip CSS block comments
      .replace(/\s+/g, ' ')                       // collapse whitespace
      .replace(/\s*([{}:;,>])\s*/g, '$1')         // trim around CSS punctuation
      .replace(/;}/g, '}')                        // drop trailing semicolon
      .trim();
    return '<style' + attrs + '>' + min + '</style>';
  });

  /* minify <script> bodies — conservative: strip block comments + collapse blank lines */
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function(_m, attrs, body) {
    if (/\bsrc=/i.test(attrs)) return '<script' + attrs + '></script>';
    var min = body
      .replace(/\/\*[\s\S]*?\*\//g, '')           // strip JS block comments
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')        // whole-line // comments
      .replace(/\n\s*\n+/g, '\n')                 // collapse blank lines
      .replace(/[ \t]+\n/g, '\n')                 // trailing spaces
      .replace(/^[ \t]+/gm, '')                   // leading indent
      .trim();
    return '<script' + attrs + '>' + min + '</script>';
  });

  /* strip HTML comments (keep IE conditionals) */
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');

  /* collapse whitespace between tags and runs of spaces */
  html = html.replace(/>\s+</g, '><').replace(/[ \t]{2,}/g, ' ').replace(/\n\s*\n+/g, '\n');

  /* restore protected blocks */
  html = html.replace(/\u0000PROT(\d+)\u0000/g, function(_m, i) { return stash[+i]; });

  return html.trim();
}

/* ════════════════════════════════════
   SPLIT — input handlers
════════════════════════════════════ */
function onFileUp(e) {
  var fs = e.target.files; if (!fs || !fs.length) return;
  var arr = Array.prototype.slice.call(fs);
  var main = arr[0];
  srcName = main.name;
  document.getElementById('upName').textContent = main.name + (arr.length > 1 ? ' + ' + (arr.length - 1) + ' extra' : '');
  var r = new FileReader();
  r.onload = function(ev) {
    document.getElementById('srcTA').value = ev.target.result;
    onTA();
    extraFiles = [];
    var rest = arr.slice(1);
    var pending = rest.length;
    if (!pending) { autoMatchExtras(); return; }
    rest.forEach(function(f) {
      var rr = new FileReader();
      rr.onload = function(ev2) {
        extraFiles.push({ name: f.name, content: ev2.target.result });
        pending--;
        if (pending === 0) autoMatchExtras();
      };
      rr.readAsText(f);
    });
  };
  r.readAsText(main);
}

function onTA() {
  var v = document.getElementById('srcTA').value;
  document.getElementById('charCt').textContent = v.length.toLocaleString() + ' chars';
  detectAndShowTabs(v);
}

function detectAndShowTabs(html) {
  if (!html.trim()) {
    detectedTabs = []; tabSelected = {};
    document.getElementById('tabsCard').style.display = 'none';
    return;
  }
  try {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    detectedTabs = detectTabs(doc);
    /* default unchecked — checkbox only means "I have a separate .html to upload" */
    var sel = {};
    detectedTabs.forEach(function(t) { sel[t.id] = false; });
    tabSelected = sel;
    renderTabsCard();
  } catch (e) {
    detectedTabs = [];
    document.getElementById('tabsCard').style.display = 'none';
  }
}

function autoMatchExtras() {
  if (!detectedTabs.length || !extraFiles.length) { renderTabsCard(); return; }
  extraFiles.forEach(function(ef) {
    var base = ef.name.replace(/\.html?$/i, '').toLowerCase();
    var match = detectedTabs.find(function(t) {
      return t.slug === base || t.label.toLowerCase() === base ||
             t.slug.indexOf(base) >= 0 || base.indexOf(t.slug) >= 0;
    });
    if (match) tabFileMap[match.id] = ef.content;
  });
  renderTabsCard();
}

function renderTabsCard() {
  var card = document.getElementById('tabsCard');
  if (!detectedTabs.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  document.getElementById('tabsCount').textContent = detectedTabs.length;
  var list = document.getElementById('tabsList');
  list.innerHTML = '';
  detectedTabs.forEach(function(t) {
    var row = document.createElement('div'); row.className = 'tab-row';
    var hasFile = !!tabFileMap[t.id];
    var isOn = !!tabSelected[t.id];
    var badgeText, badgeCls;
    if (hasFile)     { badgeText = 'file uploaded';     badgeCls = 'badge-ok'; }
    else if (isOn)   { badgeText = 'awaiting upload';   badgeCls = ''; }
    else             { badgeText = 'pulled from main';  badgeCls = ''; }
    row.innerHTML =
      '<input type="checkbox" ' + (isOn ? 'checked' : '') + ' data-tabid="' + t.id + '">' +
      '<div class="tab-row-info">' +
        '<div class="tab-row-name">' + escapeHtml(t.label) + '</div>' +
        '<div class="tab-row-slug">apps/' + t.slug + '/</div>' +
      '</div>' +
      '<span class="badge ' + badgeCls + '">' + badgeText + '</span>' +
      '<label class="tab-row-ulbl ' + (isOn ? '' : 'disabled') + '" title="' + (isOn ? 'Upload a separate .html for this tab' : 'Tick the checkbox first') + '">' +
        'Upload .html' +
        '<input type="file" accept=".html,.htm" data-tabid="' + t.id + '" ' + (isOn ? '' : 'disabled') + '>' +
      '</label>';
    list.appendChild(row);
  });
  list.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      tabSelected[cb.dataset.tabid] = cb.checked;
      renderTabsCard(); /* refresh upload button state */
    });
  });
  list.querySelectorAll('input[type=file]').forEach(function(fi) {
    fi.addEventListener('change', function(e) {
      var f = e.target.files[0]; if (!f) return;
      var rr = new FileReader();
      rr.onload = function(ev) { tabFileMap[fi.dataset.tabid] = ev.target.result; renderTabsCard(); };
      rr.readAsText(f);
    });
  });
}

/* ════════════════════════════════════
   TAB DETECTION (DOM-based)
════════════════════════════════════ */
function slugify(s) {
  return (s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tab';
}

/* Try common id patterns to find the panel for a given key */
function findPanelForKey(doc, key) {
  if (!key) return null;
  var k = key.replace(/^#/, '');
  var attempts = [
    k,
    'panel-' + k, 'tab-' + k, 'view-' + k, 'screen-' + k, 'page-' + k, 'app-' + k, 'section-' + k, 'content-' + k,
    k + '-panel', k + '-tab', k + '-view', k + '-screen', k + '-page', k + '-app', k + '-section', k + '-content'
  ];
  for (var i = 0; i < attempts.length; i++) {
    var el = doc.getElementById(attempts[i]);
    if (el) return el;
  }
  /* try data-attribute panels */
  var byData = doc.querySelector(
    '[data-panel="' + k + '"], [data-view="' + k + '"], [data-screen="' + k + '"], ' +
    '[data-page="' + k + '"], [data-app="' + k + '"], [data-tab-panel="' + k + '"], [data-tab-content="' + k + '"]'
  );
  if (byData) return byData;
  return null;
}

/* Heuristic: does this element look like a real "panel" container? */
function looksLikePanel(el) {
  if (!el || !el.id) return false;
  var tag = (el.tagName || '').toLowerCase();
  if (['span', 'a', 'i', 'em', 'strong', 'small', 'br', 'hr', 'img', 'input', 'button'].indexOf(tag) >= 0) return false;
  var html = el.innerHTML || '';
  /* must have meaningful content */
  if (html.trim().length < 30) return false;
  return true;
}

/* Generic, broad detector — catches any "tab/sub-app" pattern */
function detectTabs(doc) {
  var found = []; var seenKeys = {};
  function pushIf(label, panel, triggerKey, triggerType) {
    if (!panel || !looksLikePanel(panel)) return;
    if (seenKeys[triggerKey]) return;
    seenKeys[triggerKey] = true;
    if (!panel.id) panel.id = 'panel-' + slugify(triggerKey);
    var clean = (label || '').trim().replace(/\s+/g, ' ').slice(0, 40) || ('Tab ' + (found.length + 1));
    found.push({
      id: 'tab-' + found.length,
      label: clean,
      slug: slugify(triggerKey || clean),
      panelSelector: '#' + panel.id,
      triggerKey: triggerKey,
      triggerType: triggerType || 'data-tab',
      contentHtml: panel.innerHTML.trim()
    });
  }

  /* 1) ARIA: role=tab + aria-controls */
  doc.querySelectorAll('[role="tab"][aria-controls]').forEach(function(btn) {
    var t = btn.getAttribute('aria-controls');
    if (t) pushIf(btn.textContent || t, doc.getElementById(t), t, 'aria-controls');
  });

  /* 2) Data-attribute triggers — wide net */
  var dataAttrs = ['data-tab', 'data-target', 'data-view', 'data-page', 'data-screen', 'data-app', 'data-section', 'data-bs-target', 'data-bs-tab'];
  dataAttrs.forEach(function(attr) {
    doc.querySelectorAll('[' + attr + ']').forEach(function(btn) {
      /* skip the panel itself if it carries the same data-attribute */
      var t = btn.getAttribute(attr) || '';
      var c = t.replace(/^#/, '');
      if (!c) return;
      pushIf(btn.textContent || c, findPanelForKey(doc, c), c, attr);
    });
  });

  /* 3) Bootstrap classic data-toggle="tab" + href */
  doc.querySelectorAll('[data-toggle="tab"], [data-bs-toggle="tab"], [data-bs-toggle="pill"]').forEach(function(btn) {
    var h = (btn.getAttribute('href') || btn.getAttribute('data-target') || btn.getAttribute('data-bs-target') || '').replace(/^#/, '');
    if (h) pushIf(btn.textContent || h, doc.getElementById(h), h, 'bs-tab');
  });

  /* 4) Anchor links inside nav-like elements */
  doc.querySelectorAll('nav a[href^="#"], .tabs a[href^="#"], .nav a[href^="#"], [role="tablist"] a[href^="#"], [class*="tab"] a[href^="#"]').forEach(function(a) {
    var h = a.getAttribute('href') || ''; var id = h.replace(/^#/, '');
    if (!id || id === '/') return;
    pushIf(a.textContent || id, doc.getElementById(id), id, 'href');
  });

  /* 5) Class-named tab buttons */
  doc.querySelectorAll('[class*="tab-btn"], [class*="tab-button"], [class*="tablink"], [class*="nav-tab"]').forEach(function(btn) {
    var t = btn.getAttribute('data-tab') || btn.getAttribute('data-target');
    if (t) {
      var c = t.replace(/^#/, '');
      pushIf(btn.textContent || c, findPanelForKey(doc, c), c, 'data-tab');
    }
  });

  /* 6) Generic onclick — ANY function call whose string arg matches a panel id pattern */
  /*    e.g.  onclick="switchTab('stck')"  /  onclick="show('home')"  /  onclick="myApp.open('foo')"  */
  var argRe = /['"]([a-zA-Z0-9_-]{1,40})['"]/g;
  doc.querySelectorAll('[onclick]').forEach(function(btn) {
    var oc = btn.getAttribute('onclick') || '';
    if (!/\(/.test(oc)) return;
    var m, matched = false;
    argRe.lastIndex = 0;
    while ((m = argRe.exec(oc)) !== null) {
      var key = m[1];
      if (key.length < 2) continue;
      var panel = findPanelForKey(doc, key);
      if (panel) {
        pushIf(btn.textContent || key, panel, key, 'onclick');
        matched = true;
        break;
      }
    }
  });

  /* 7) Structural fallback — find tab-pane / view containers grouped under a single parent  */
  var groupSels = ['.tab-content', '.tab-panes', '[role="tabpanel"]'];
  doc.querySelectorAll('.tab-pane[id], .tabpanel[id]').forEach(function(panel) {
    pushIf(panel.getAttribute('aria-label') || panel.id, panel, panel.id, 'tab-pane');
  });

  return found;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(ch) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch];
  });
}

/* ════════════════════════════════════
   IMAGE EXTRACTION (per sub-app)
════════════════════════════════════ */
function extractImagesFromDoc(doc, subPath, filesObj, counterRef) {
  doc.querySelectorAll('img[src]').forEach(function(img) {
    var src = img.getAttribute('src') || '';
    var m = src.match(/^data:image\/([a-zA-Z+.-]+);base64,/);
    if (!m) return;
    var ext = m[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';
    counterRef.n++;
    var rel = 'images/img' + counterRef.n + '.' + ext;
    filesObj[subPath + rel] = src;
    img.setAttribute('src', rel);
  });
}

function extractImagesFromCss(cssText, subPath, filesObj, counterRef) {
  return cssText.replace(/url\((['"]?)(data:image\/([a-zA-Z+.-]+);base64,[^'")\s]+)\1\)/g, function(_m, _q, dataUri, ext) {
    var e = ext.toLowerCase();
    if (e === 'jpeg') e = 'jpg';
    if (e === 'svg+xml') e = 'svg';
    counterRef.n++;
    var rel = 'images/img' + counterRef.n + '.' + e;
    filesObj[subPath + rel] = dataUri;
    return 'url(' + rel + ')';
  });
}

/* ════════════════════════════════════
   SPLIT — core logic
════════════════════════════════════ */
function splitOneDocument(rawHtml, subPath, detectedSubApps, warnings) {
  var doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  var out = {};
  var imgCounter = { n: 0 };

  /* extract <style> blocks */
  var cssParts = [];
  Array.prototype.slice.call(doc.querySelectorAll('style')).forEach(function(s, i) {
    var txt = (s.textContent || '').trim();
    if (txt) cssParts.push('/* ── inline <style> #' + (i + 1) + ' ── */\n' + txt);
    s.parentNode.removeChild(s);
  });

  /* extract <script> blocks */
  var jsParts = []; var externalScripts = [];
  Array.prototype.slice.call(doc.querySelectorAll('script')).forEach(function(s, i) {
    var src = s.getAttribute('src');
    if (src) externalScripts.push(src);
    else { var txt = (s.textContent || '').trim(); if (txt) jsParts.push('/* ── inline <script> #' + (i + 1) + ' ── */\n' + txt); }
    s.parentNode.removeChild(s);
  });

  /* sub-app placeholders — replace panel content with a link to the sub-app */
  detectedSubApps.forEach(function(sa) {
    var panel = doc.querySelector(sa.tab.panelSelector || sa.tab.selector);
    if (panel) {
      panel.innerHTML = '<div data-subapp="' + sa.tab.slug + '" style="padding:32px;text-align:center;font-family:system-ui,sans-serif;">' +
        '<p style="color:#666;font-size:13px;margin-bottom:8px;">This tab has been split into its own sub-app folder.</p>' +
        '<p><a href="apps/' + sa.tab.slug + '/index.html" style="color:#111;font-weight:600;text-decoration:none;border-bottom:1px solid #111;">Open ' + escapeHtml(sa.tab.label) + '</a></p>' +
        '</div>';
    }
  });
  /* rewire any trigger (button/anchor/anything) for this sub-app to navigate to its index.html */
  detectedSubApps.forEach(function(sa) {
    var key = sa.tab.triggerKey || (sa.tab.panelSelector || '').replace(/^#/, '');
    var bare = key.replace(/^#/, '');
    var panelId = (sa.tab.panelSelector || '').replace(/^#/, '');
    var href = 'apps/' + sa.tab.slug + '/index.html';
    var dataAttrs = ['data-tab', 'data-target', 'data-view', 'data-page', 'data-screen', 'data-app', 'data-section', 'data-bs-target', 'data-bs-tab'];
    var sels = ['[aria-controls="' + bare + '"]', '[aria-controls="' + panelId + '"]'];
    dataAttrs.forEach(function(a) {
      sels.push('[' + a + '="' + bare + '"]', '[' + a + '="#' + bare + '"]');
      if (panelId !== bare) sels.push('[' + a + '="' + panelId + '"]', '[' + a + '="#' + panelId + '"]');
    });
    sels.push('a[href="#' + bare + '"]');
    if (panelId !== bare) sels.push('a[href="#' + panelId + '"]');

    var seen = new Set();
    try { doc.querySelectorAll(sels.join(',')).forEach(function(el) { seen.add(el); }); } catch (e) {}

    /* generic onclick — any function call whose string arg equals our key */
    var esc = function(s) { return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'); };
    var ocRe = new RegExp('[\'"](?:' + esc(bare) + '|' + esc(panelId) + ')[\'"]');
    doc.querySelectorAll('[onclick]').forEach(function(el) {
      var oc = el.getAttribute('onclick') || '';
      if (ocRe.test(oc)) seen.add(el);
    });

    seen.forEach(function(el) {
      /* don't rewire the panel itself if it happened to carry the same attribute */
      if (el.id === panelId || el.id === bare) return;
      var a = doc.createElement('a');
      a.setAttribute('href', href);
      a.setAttribute('data-subapp-link', sa.tab.slug);
      a.style.cssText = (el.getAttribute('style') || '') + ';text-decoration:none;color:inherit;cursor:pointer;';
      if (el.className) a.className = el.className;
      a.innerHTML = el.innerHTML;
      el.parentNode.replaceChild(a, el);
    });
  });

  /* extract images from <img src=data:...> */
  extractImagesFromDoc(doc, subPath, out, imgCounter);

  var head = doc.querySelector('head');
  if (!head) { head = doc.createElement('head'); doc.documentElement.insertBefore(head, doc.documentElement.firstChild); }
  var body = doc.querySelector('body');
  if (!body) { body = doc.createElement('body'); doc.documentElement.appendChild(body); }

  if (subPath) {
    var back = doc.createElement('div');
    back.setAttribute('style', 'padding:10px 14px;border-bottom:1px solid #eee;background:#fafafa;font-family:system-ui,sans-serif;font-size:13px;');
    back.innerHTML = '<a href="../../index.html" style="text-decoration:none;color:#111;">Back to dashboard</a>';
    body.insertBefore(back, body.firstChild);
  }

  /* CSS — always emit a css/main.css (extract data: images first) */
  var cssText = cssParts.length ? cssParts.join('\n\n') : '/* No styles extracted from this document. */\n';
  cssText = extractImagesFromCss(cssText, subPath, out, imgCounter);
  var link = doc.createElement('link');
  link.setAttribute('rel', 'stylesheet'); link.setAttribute('href', 'css/main.css');
  head.appendChild(link);
  out[subPath + 'css/main.css'] = cssText;

  /* JS — always emit a js/main.js */
  var jsText = jsParts.length ? jsParts.join('\n\n') : '/* No scripts extracted from this document. */\n';
  var sc = doc.createElement('script');
  sc.setAttribute('src', 'js/main.js'); sc.setAttribute('defer', '');
  head.appendChild(sc);
  out[subPath + 'js/main.js'] = jsText;
  externalScripts.forEach(function(src) {
    var sc2 = doc.createElement('script');
    sc2.setAttribute('src', src);
    head.appendChild(sc2);
  });

  out[subPath + 'index.html'] = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

  detectedSubApps.forEach(function(sa) {
    if (sa.subFiles) {
      Object.keys(sa.subFiles).forEach(function(p) {
        out[subPath + 'apps/' + sa.tab.slug + '/' + p] = sa.subFiles[p];
      });
    }
  });

  return out;
}

function buildSubAppFiles(tab) {
  var srcHtmlSub = tabFileMap[tab.id];
  var files;
  if (srcHtmlSub) {
    files = splitOneDocument(srcHtmlSub, '', [], splitWarnings);
  } else {
    /* ── BUG FIX: carry parent doc's <style> and stylesheet <link> tags into each
       sub-app so the sub-app's CSS isn't lost. We INLINE linked stylesheets when
       possible (so sub-app folders are fully self-contained) and only fall back
       to leaving an absolute <link> when the sheet text is unavailable. */
    var parentHeadCSS = '';
    try {
      var pdoc = new DOMParser().parseFromString(srcHtml || '', 'text/html');
      var phead = pdoc.querySelector('head');
      if (phead) {
        // 1) Preserve preconnects (so @import-based font URLs still resolve)
        Array.prototype.slice.call(phead.querySelectorAll('link[rel="preconnect"]')).forEach(function(l){
          var href = l.getAttribute('href') || '';
          if (!href) return;
          parentHeadCSS += '<link rel="preconnect" href="' + escapeHtml(href) + '">\n';
        });
        // 2) Inline parent <style> blocks verbatim
        Array.prototype.slice.call(phead.querySelectorAll('style')).forEach(function(s){
          var t = (s.textContent || '').trim();
          if (t) parentHeadCSS += '<style>\n' + t + '\n</style>\n';
        });
        // 3) For each linked stylesheet, try to find its text in tabFileMap (sibling files
        //    captured at upload time). If found, inline it. Otherwise leave the link with
        //    an absolutized href so it still resolves against the original origin.
        Array.prototype.slice.call(phead.querySelectorAll('link[rel="stylesheet"], link[as="style"]')).forEach(function(l){
          var href = l.getAttribute('href') || '';
          if (!href) return;
          var inlineText = null;
          try {
            // Build a content lookup from extraFiles (uploaded sibling files).
            // Match by basename so 'css/main.css' matches an extraFile named 'main.css',
            // 'css/main.css', or any path ending with the same basename.
            var key = href.replace(/^\.?\//,'').split('?')[0].split('#')[0];
            var basename = key.split('/').pop();
            if (Array.isArray(extraFiles) && extraFiles.length) {
              for (var i = 0; i < extraFiles.length; i++) {
                var ef = extraFiles[i];
                if (!ef || typeof ef.content !== 'string') continue;
                var efName = String(ef.name || '');
                var efBase = efName.split('/').pop().split('\\').pop();
                if (efName === key || efName === basename || efBase === basename) {
                  inlineText = ef.content;
                  break;
                }
              }
            }
          } catch(e) {}
          if (inlineText) {
            parentHeadCSS += '<style>\n' + inlineText + '\n</style>\n';
          } else {
            // Best-effort: if href is relative, leave as-is with a comment so the
            // user knows it may need manual handling. Absolute/remote works fine.
            parentHeadCSS += '<link rel="stylesheet" href="' + escapeHtml(href) + '">\n';
          }
        });
      }
    } catch(e) { /* ignore — fall back to bare standalone */ }
    var standalone = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' +
      escapeHtml(tab.label) + '</title>\n' + parentHeadCSS + '</head><body>' + tab.contentHtml + '</body></html>';
    files = splitOneDocument(standalone, '', [], splitWarnings);
  }
  /* inject a back-arrow bar into the sub-app's index.html
     (subPath is '' so the normal back-link code never fires) */
  if (files['index.html']) {
    var bdoc = new DOMParser().parseFromString(files['index.html'], 'text/html');
    var bbody = bdoc.querySelector('body');
    if (bbody) {
      var backBar = bdoc.createElement('div');
      backBar.id = '__subapp-back__';
      backBar.setAttribute('style',
        'position:sticky;top:0;z-index:9999;padding:9px 16px;background:#fafafa;' +
        'border-bottom:1px solid #e4e4e4;font-family:system-ui,sans-serif;font-size:13px;' +
        'display:flex;align-items:center;gap:8px;');
      backBar.innerHTML =
        '<a href="../../index.html" id="__back-link__" style="display:flex;align-items:center;gap:6px;' +
        'text-decoration:none;color:#111;font-weight:500;">' +
        '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="12,4 6,10 12,16"/></svg>' +
        'Dashboard</a>' +
        '<span style="color:#bbb;font-size:11px;margin-left:4px;">/ ' + escapeHtml(tab.label) + '</span>';
      bbody.insertBefore(backBar, bbody.firstChild);
    }
    files['index.html'] = '<!DOCTYPE html>\n' + bdoc.documentElement.outerHTML;
  }
  return files;
}

/* ════════════════════════════════════
   SPLIT — runner
════════════════════════════════════ */
function runSplit() {
  var html = document.getElementById('srcTA').value.trim();
  if (!html) { alert('Paste or upload an HTML file first.'); return; }
  splitFiles = {}; errors = []; curFile = null; collapsed = {};
  splitWarnings = [];
  srcHtml = html;
  appName = detectName(html);
  if (document.getElementById('upName').textContent === '—') srcName = appName + '.html';

  /* every detected app always becomes its own folder; checkbox only matters for upload */
  var subApps = detectedTabs.map(function(t) {
    return { tab: t, subFiles: buildSubAppFiles(t) };
  });

  splitFiles = splitOneDocument(srcHtml, '', subApps, splitWarnings);

  validateSplit();
  flex('splitEd'); hide('splitIn');
  document.getElementById('actSource').style.display = '';
  sbView = 'tree'; sbOpen = true;
  document.getElementById('sidebar').classList.remove('shut');
  refreshActBtns();
  refreshSB();
  refreshFoot();
  applyPreviewState();
  curFile = 'index.html';
  showSplitFile('index.html');
  refreshPreview();
}

function detectName(html) {
  var m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (m) return m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-app';
  return 'my-app';
}

function validateSplit() {
  errors = [];
  Object.keys(splitFiles).forEach(function(p) {
    if (!(splitFiles[p] || '').trim() && !/^data:image/.test(splitFiles[p] || '')) {
      errors.push({ file: p, msg: 'Empty file' });
    }
  });
}

/* ════════════════════════════════════
   STRUCTURAL ISSUE ANALYSIS
════════════════════════════════════ */
function fileKindOf(name) {
  var ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'js' || ext === 'mjs') return 'js';
  if (['png','jpg','jpeg','gif','svg','webp','ico'].indexOf(ext) >= 0) return 'image';
  return 'misc';
}

function analyzeCode(content, kind) {
  var out = [];
  if (kind === 'html') {
    var o = (content.match(/<div\b/gi) || []).length;
    var c = (content.match(/<\/div>/gi) || []).length;
    if (o !== c) out.push({ severity:'warn', message:'Mismatched <div> tags: ' + o + ' opening vs ' + c + ' closing.', suggestion:'Check for an unclosed or extra </div> in the document.' });
    if (!/<!DOCTYPE/i.test(content)) out.push({ severity:'warn', message:'Missing <!DOCTYPE html> declaration.', suggestion:'Add <!DOCTYPE html> as the first line.' });
  } else if (kind === 'css') {
    var co = (content.match(/\{/g) || []).length;
    var cc = (content.match(/\}/g) || []).length;
    if (co !== cc) out.push({ severity:'err', message:'Mismatched braces: ' + co + " '{' vs " + cc + " '}'.", suggestion:'Find the missing brace — usually near the bottom.' });
  } else if (kind === 'js') {
    var jo = (content.match(/\{/g) || []).length;
    var jc = (content.match(/\}/g) || []).length;
    if (jo !== jc) out.push({ severity:'err', message:'Mismatched braces: ' + jo + " '{' vs " + jc + " '}'.", suggestion:'Run this through a JS linter — there is a structural mismatch.' });
    if (/console\.log\(/.test(content)) out.push({ severity:'warn', message:'console.log() calls detected.', suggestion:'Consider removing debug logs before shipping.' });
  }
  return out;
}

/* ════════════════════════════════════
   ERRORS PANEL
════════════════════════════════════ */
function renderErrors() {
  var p = document.getElementById('errPanel');
  var l = document.getElementById('errList');
  var all = errors.slice();
  if (curFile && splitFiles[curFile] && !/^data:image/.test(splitFiles[curFile])) {
    var iss = analyzeCode(splitFiles[curFile], fileKindOf(curFile));
    iss.forEach(function(i) { all.push({ file: curFile, msg: i.message, sev: i.severity }); });
  }
  if (!all.length) { p.style.display = 'none'; return; }
  p.style.display = ''; l.innerHTML = '';
  all.forEach(function(e) {
    var d = document.createElement('div'); d.className = 'err-item';
    d.innerHTML = '<span>' + e.file + ': ' + escapeHtml(e.msg) + '</span>';
    l.appendChild(d);
  });
}

/* ════════════════════════════════════
   FILE TREE
════════════════════════════════════ */
function buildTree(filesObj) {
  var root = { name: appName, path: '', children: {}, files: [], isRoot: true };
  Object.keys(filesObj).sort().forEach(function(fpath) {
    var parts = fpath.split('/');
    if (parts.length === 1) { root.files.push({ name: parts[0], path: fpath }); }
    else {
      var node = root;
      for (var i = 0; i < parts.length - 1; i++) {
        var pname = parts.slice(0, i + 1).join('/');
        if (!node.children[pname]) node.children[pname] = { name: parts[i], path: pname, children: {}, files: [] };
        node = node.children[pname];
      }
      node.files.push({ name: parts[parts.length - 1], path: fpath });
    }
  });
  return root;
}

function renderSplitTree() {
  var el = document.getElementById('treeEl'); el.innerHTML = '';
  renderNode(el, buildTree(splitFiles), 0, true);
}
function renderCombTree() {
  var el = document.getElementById('treeEl'); el.innerHTML = '';
  renderNode(el, buildTree(combFiles), 0, true);
}

function renderNode(container, node, depth, isRoot) {
  var key = node.path || '__root__';
  var isCol = !!collapsed[key];
  var row = document.createElement('div');
  row.className = 'tr folder-row';
  row.style.paddingLeft = (depth * 16 + 4) + 'px';
  row.innerHTML =
    mkGuides(depth) +
    '<span class="tr-chevron ' + (isCol ? 'closed' : 'open') + '">' + chevSvg() + '</span>' +
    folderSvg() +
    '<span class="tr-name">' + escapeHtml(node.name) + (isRoot ? '/' : '') + '</span>';
  row.onclick = function() { collapsed[key] = !collapsed[key]; mode === 'split' ? renderSplitTree() : renderCombTree(); };
  container.appendChild(row);
  if (isCol) return;

  var group = document.createElement('div');
  group.style.position = 'relative';
  var guide = document.createElement('div');
  guide.style.cssText = 'position:absolute;left:' + (depth * 16 + 12) + 'px;top:0;bottom:0;width:1px;background:#e4e4e4;pointer-events:none;';
  group.appendChild(guide);

  Object.keys(node.children).sort().forEach(function(k) { renderNode(group, node.children[k], depth + 1, false); });

  node.files.forEach(function(f) {
    var frow = document.createElement('div');
    var isSel = (mode === 'split' && curFile === f.path);
    frow.className = 'tr tree-file' + (isSel ? ' sel' : '');
    frow.style.paddingLeft = ((depth + 1) * 16 + 20) + 'px';
    frow.innerHTML = '<span class="tr-dot ' + dotCls(f.name) + '"></span><span class="tr-name">' + escapeHtml(f.name) + '</span>';
    (function(fp) {
      frow.onclick = function(e) { e.stopPropagation(); mode === 'split' ? showSplitFile(fp) : showCombFile(fp); };
    })(f.path);
    group.appendChild(frow);
  });
  if (group.childNodes.length > 1) container.appendChild(group);
}

function mkGuides(depth) { var s = ''; for (var i = 0; i < depth; i++) s += '<span class="tr-guide"></span>'; return s; }
function chevSvg() { return '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3 5,6 8,3"/></svg>'; }
function folderSvg() { return '<svg class="tr-folder-ico" viewBox="0 0 16 16" fill="#888"><path d="M1.5 3A1.5 1.5 0 013 1.5h3.586a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 009.62 3.5H13A1.5 1.5 0 0114.5 5v7A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V3z"/></svg>'; }
function dotCls(name) {
  if (/\.html?$/.test(name)) return 'd-html';
  if (/\.css$/.test(name))   return 'd-css';
  if (/\.js$/.test(name))    return 'd-js';
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(name)) return 'd-img';
  return 'd-misc';
}

/* ════════════════════════════════════
   SOURCE VIEW
════════════════════════════════════ */
function renderSrcView() {
  hide('treeEl'); hide('sbEmpty'); hide('errPanel'); showEl('srcEl');
  var el = document.getElementById('srcEl'); el.innerHTML = '';
  if (!srcHtml) { el.innerHTML = '<div class="tree-empty">No source loaded</div>'; return; }
  var fi = document.createElement('div'); fi.className = 'src-file-item';
  fi.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="#a855f7"><path d="M4 1.5A1.5 1.5 0 015.5 0h5.379a1.5 1.5 0 011.06.44l2.122 2.12A1.5 1.5 0 0114.5 3.622V14.5A1.5 1.5 0 0113 16H5.5A1.5 1.5 0 014 14.5v-13z"/></svg>' +
    '<span class="src-fname">' + escapeHtml(srcName) + '</span>' +
    '<span class="src-fsize">' + fmtSz(srcHtml.length) + '</span>';
  fi.onclick = function() { showRaw(srcName, srcHtml); };
  el.appendChild(fi);
  var lbl = document.createElement('div'); lbl.className = 'src-preview-label'; lbl.textContent = 'Preview (first 80 lines)';
  el.appendChild(lbl);
  var pre = document.createElement('div'); pre.className = 'src-preview';
  pre.textContent = srcHtml.split('\n').slice(0, 80).join('\n');
  el.appendChild(pre);
}

/* ════════════════════════════════════
   FILE VIEWER
════════════════════════════════════ */
function showSplitFile(path) {
  curFile = path;
  var content = splitFiles[path] || '';
  var displayContent = /^data:image/.test(content) ? '[Binary image: ' + path + ']' : content;
  showRaw(path.split('/').pop(), displayContent);

  var kind = fileKindOf(path);
  var kEl = document.getElementById('edKind');
  kEl.textContent = kind; kEl.style.display = '';

  var iss = /^data:image/.test(content) ? [] : analyzeCode(content, kind);
  var iEl = document.getElementById('edIssues');
  if (iss.length) {
    var hasErr = iss.some(function(i) { return i.severity === 'err'; });
    iEl.textContent = iss.length + ' issue' + (iss.length > 1 ? 's' : '');
    iEl.className = 'badge ' + (hasErr ? 'badge-err' : 'badge-warn');
    iEl.style.display = '';
  } else {
    iEl.style.display = 'none';
  }

  /* DO NOT auto-collapse the sidebar — only the activity-bar button can close it */
  renderSplitTree();
  renderErrors();
}

function showCombFile(path) {
  var content = combFiles[path] || '';
  if (/^data:image/.test(content)) content = '[Binary image: ' + path + ']';
  showRawComb(path.split('/').pop(), content);
}

function showRaw(name, content) {
  var el = document.getElementById('edFname');
  el.textContent = name; el.className = 'ed-fname';
  var lines = content.split('\n');
  document.getElementById('lnums').textContent = lines.map(function(_, i) { return i + 1; }).join('\n');
  document.getElementById('ccode').textContent = content;
  document.getElementById('edEmpty').style.display = 'none';
  document.getElementById('cwrap').style.display = 'flex';
}

function showRawComb(name, content) {
  var el = document.getElementById('cEdFname');
  el.textContent = name; el.className = 'ed-fname';
  var lines = content.split('\n');
  document.getElementById('cLnums').textContent = lines.map(function(_, i) { return i + 1; }).join('\n');
  document.getElementById('cCode').textContent = content;
  document.getElementById('cEdEmpty').style.display = 'none';
  document.getElementById('cCwrap').style.display = 'flex';
}

/* ════════════════════════════════════
   LIVE PREVIEW
════════════════════════════════════ */
function buildSplitPreviewDoc(rootIndexPath) {
  var indexEntry = splitFiles[rootIndexPath]; if (!indexEntry) return '<!doctype html><body>No preview</body>';
  var doc = new DOMParser().parseFromString(indexEntry, 'text/html');
  var dir = rootIndexPath.indexOf('/') >= 0 ? rootIndexPath.replace(/\/[^/]+$/, '/') : '';
  var isSubApp = rootIndexPath !== 'index.html';
  /* when previewing a sub-app, rewrite the back link so it navigates via parent
     instead of trying to follow a relative ../../index.html path */
  if (isSubApp) {
    doc.querySelectorAll('a[href="../../index.html"], a#__back-link__').forEach(function(a) {
      a.setAttribute('href', 'javascript:void(0)');
      a.setAttribute('onclick', 'window.parent && window.parent.previewSubApp && window.parent.previewSubApp(\'__root__\'); return false;');
    });
  }
  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link) {
    var href = link.getAttribute('href') || ''; var full = dir + href;
    if (splitFiles[full]) {
      var s = doc.createElement('style'); s.textContent = inlineCssImagesForPreview(splitFiles[full], dir);
      link.parentNode.replaceChild(s, link);
    }
  });
  doc.querySelectorAll('script[src]').forEach(function(sc) {
    var src = sc.getAttribute('src') || '';
    if (/^https?:|^\/\//.test(src)) return;
    var full = dir + src;
    if (splitFiles[full]) {
      var ns = doc.createElement('script'); ns.textContent = splitFiles[full];
      sc.parentNode.replaceChild(ns, sc);
    }
  });
  doc.querySelectorAll('img[src]').forEach(function(img) {
    var src = img.getAttribute('src') || '';
    if (src.indexOf('data:') === 0 || /^https?:/.test(src)) return;
    var full = dir + src;
    if (splitFiles[full]) img.setAttribute('src', splitFiles[full]);
  });
  doc.querySelectorAll('a[data-subapp-link], a[href^="apps/"]').forEach(function(a) {
    var slug = a.getAttribute('data-subapp-link') || '';
    if (!slug) {
      var href = a.getAttribute('href') || '';
      var m = href.match(/^apps\/([^/]+)\//);
      if (m) slug = m[1];
    }
    if (slug) {
      a.setAttribute('href', 'javascript:void(0)');
      a.setAttribute('onclick', 'window.parent && window.parent.previewSubApp && window.parent.previewSubApp(' + JSON.stringify(slug) + '); return false;');
      a.removeAttribute('style');
      a.style.cursor = 'pointer';
    }
  });
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function inlineCssImagesForPreview(cssText, dir) {
  return cssText.replace(/url\((['"]?)([^'")\s]+)\1\)/g, function(m, _q, src) {
    if (src.indexOf('data:') === 0 || /^https?:/.test(src)) return m;
    var full = dir + src;
    if (splitFiles[full]) return 'url(' + splitFiles[full] + ')';
    return m;
  });
}

function refreshPreview() {
  if (mode !== 'split' || !Object.keys(splitFiles).length || !prevOn) return;
  var html = buildSplitPreviewDoc(currentPreviewPath);
  var fr = document.getElementById('prevFrame');
  fr.srcdoc = html;
}

/* Called from inside the preview iframe via window.parent.previewSubApp(slug) */
window.previewSubApp = function(slug) {
  if (slug === '__root__') {
    currentPreviewPath = 'index.html';
  } else {
    var path = 'apps/' + slug + '/index.html';
    if (splitFiles[path]) currentPreviewPath = path;
  }
  refreshPreview();
};

function refreshCombPreview() {
  if (mode !== 'combine' || !prevOn) return;
  var fr = document.getElementById('cPrevFrame');
  fr.srcdoc = combResult || '';
}

/* ════════════════════════════════════
   RESET
════════════════════════════════════ */
function resetSplit() {
  splitFiles = {}; errors = []; curFile = null; srcHtml = ''; collapsed = {};
  detectedTabs = []; tabSelected = {}; tabFileMap = {}; extraFiles = [];
  currentPreviewPath = 'index.html';
  document.getElementById('srcTA').value = '';
  document.getElementById('upName').textContent = '—';
  document.getElementById('charCt').textContent = '0 chars';
  document.getElementById('actSource').style.display = 'none';
  document.getElementById('tabsCard').style.display = 'none';
  sbView = 'tree'; sbOpen = true;
  document.getElementById('sidebar').classList.remove('shut');
  refreshActBtns();
  flex('splitIn'); hide('splitEd');
  sbEmpty(); refreshFoot();
}

/* ════════════════════════════════════
   DOWNLOAD (Split)
════════════════════════════════════ */
function downloadZip() {
  var zip = new JSZip();
  var folder = zip.folder(appName);
  Object.keys(splitFiles).forEach(function(p) {
    var c = splitFiles[p];
    if (/^data:image/.test(c)) folder.file(p, c.split(',')[1], { base64: true });
    else folder.file(p, c);
  });
  folder.file('_source/' + srcName, srcHtml);
  zip.generateAsync({ type: 'blob' }).then(function(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = appName + '.zip'; a.click();
  });
}

/* ════════════════════════════════════
   COMBINE — ZIP upload & recursive flatten
════════════════════════════════════ */
function dzOver(e) { e.preventDefault(); document.getElementById('dz').classList.add('dg'); }
function dzDrop(e) {
  e.preventDefault(); document.getElementById('dz').classList.remove('dg');
  var f = e.dataTransfer.files[0];
  if (f && /\.zip$/i.test(f.name)) processZip(f);
}
function onZipUp(e) { var f = e.target.files[0]; if (f) processZip(f); }

function onExtraImg(e) {
  var files = e.target.files;
  for (var i = 0; i < files.length; i++) (function(f) {
    var r = new FileReader();
    r.onload = function(ev) { extraImgs[f.name] = ev.target.result; buildCombined(); refreshCombPreview(); };
    r.readAsDataURL(f);
  })(files[i]);
}

function processZip(zipFile) {
  JSZip.loadAsync(zipFile).then(function(zip) {
    combFiles = {};
    var ps = [];
    /* discover top-level folder name (if any) for clean stripping */
    var entries = [];
    zip.forEach(function(rp, entry) { if (!entry.dir) entries.push({ rp: rp, entry: entry }); });
    var topFolder = null;
    if (entries.length) {
      var first = entries[0].rp.split('/');
      if (first.length > 1) {
        var candidate = first[0];
        var allSame = entries.every(function(e) { return e.rp.split('/')[0] === candidate; });
        if (allSame) topFolder = candidate;
      }
    }
    entries.forEach(function(it) {
      var rp = topFolder ? it.rp.substring(topFolder.length + 1) : it.rp;
      if (!rp) return;
      var p;
      if (/\.(png|jpg|jpeg|gif|webp|ico|svg)$/i.test(rp)) {
        p = it.entry.async('base64').then(function(b64) {
          var ext = rp.split('.').pop().toLowerCase();
          var mime = ext === 'svg' ? 'image/svg+xml' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
          combFiles[rp] = 'data:' + mime + ';base64,' + b64;
        });
      } else {
        p = it.entry.async('string').then(function(txt) { combFiles[rp] = txt; });
      }
      ps.push(p);
    });
    Promise.all(ps).then(function() {
      buildCombined();
      flex('combEd'); hide('combIn');
      sbView = 'tree'; sbOpen = true;
      document.getElementById('sidebar').classList.remove('shut');
      refreshActBtns(); refreshSB(); refreshFoot();
      applyPreviewState();
      refreshCombPreview();
    });
  }).catch(function(err) { alert('Could not read ZIP: ' + err.message); });
}

/* Recursively combine a sub-tree of files at a given basePath into one HTML doc string. */
function combineRecursive(filesObj, basePath, missingArr) {
  var idxPath = basePath + 'index.html';
  var idx = filesObj[idxPath];
  if (!idx) {
    /* fallback: any html in this base */
    var anyHtml = Object.keys(filesObj).find(function(p) {
      return p.indexOf(basePath) === 0 && /\.html?$/i.test(p) &&
             p.substring(basePath.length).indexOf('/') === -1;
    });
    if (!anyHtml) return null;
    idx = filesObj[anyHtml];
    idxPath = anyHtml;
  }
  var doc = new DOMParser().parseFromString(idx, 'text/html');

  /* inline this level's CSS (with image rewriting) */
  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link) {
    var href = link.getAttribute('href') || '';
    if (/^https?:|^\/\//.test(href)) return;
    var full = basePath + href;
    if (filesObj[full]) {
      var css = filesObj[full];
      css = css.replace(/url\((['"]?)([^'")\s]+)\1\)/g, function(m, _q, src) {
        if (src.indexOf('data:') === 0 || /^https?:/.test(src)) return m;
        var f = basePath + src;
        if (filesObj[f]) return 'url(' + filesObj[f] + ')';
        missingArr.push(src);
        return m;
      });
      var s = doc.createElement('style'); s.textContent = css;
      link.parentNode.replaceChild(s, link);
    }
  });

  /* inline this level's JS */
  doc.querySelectorAll('script[src]').forEach(function(sc) {
    var src = sc.getAttribute('src') || '';
    if (/^https?:|^\/\//.test(src)) return;
    var full = basePath + src;
    if (filesObj[full]) {
      var ns = doc.createElement('script'); ns.textContent = filesObj[full];
      sc.parentNode.replaceChild(ns, sc);
    }
  });

  /* inline images on this level (embed as base64) */
  doc.querySelectorAll('img[src]').forEach(function(img) {
    var src = img.getAttribute('src') || '';
    if (src.indexOf('data:') === 0 || /^https?:/.test(src)) return;
    var full = basePath + src;
    var fn = src.split('/').pop();
    if (filesObj[full]) img.setAttribute('src', filesObj[full]);
    else if (extraImgs[fn]) img.setAttribute('src', extraImgs[fn]);
    else missingArr.push(src);
  });

  /* discover sub-apps under apps/ */
  var subApps = {};
  Object.keys(filesObj).forEach(function(p) {
    var prefix = basePath + 'apps/';
    if (p.indexOf(prefix) === 0) {
      var rest = p.substring(prefix.length);
      var slug = rest.split('/')[0];
      if (slug && !subApps[slug]) subApps[slug] = true;
    }
  });

  /* recursively combine each sub-app and inline as a section */
  Object.keys(subApps).forEach(function(slug) {
    var subBase = basePath + 'apps/' + slug + '/';
    var subHtml = combineRecursive(filesObj, subBase, missingArr);
    if (!subHtml) return;
    var subDoc = new DOMParser().parseFromString(subHtml, 'text/html');
    var subBody = subDoc.querySelector('body');
    var subHead = subDoc.querySelector('head');

    /* strip the 'Back to dashboard' helper we added in split */
    if (subBody) {
      Array.prototype.slice.call(subBody.querySelectorAll('a[href="../../index.html"]')).forEach(function(a) {
        var wrap = a.parentNode;
        if (wrap && wrap.parentNode === subBody) subBody.removeChild(wrap);
      });
    }

    /* find placeholder div in main doc & replace its content with sub-app body */
    var placeholder = doc.querySelector('div[data-subapp="' + slug + '"]');
    if (placeholder && subBody) {
      placeholder.innerHTML = '';
      placeholder.id = slug;
      Array.prototype.slice.call(subBody.childNodes).forEach(function(child) {
        placeholder.appendChild(doc.importNode(child, true));
      });
    } else if (subBody) {
      /* no placeholder — append at end of body as a section */
      var section = doc.createElement('section');
      section.id = slug;
      section.setAttribute('data-subapp', slug);
      Array.prototype.slice.call(subBody.childNodes).forEach(function(child) {
        section.appendChild(doc.importNode(child, true));
      });
      doc.body.appendChild(section);
    }

    /* hoist sub-app styles into main head */
    if (subHead) {
      Array.prototype.slice.call(subHead.querySelectorAll('style')).forEach(function(st) {
        doc.head.appendChild(doc.importNode(st, true));
      });
    }
    /* hoist any inline scripts from sub body into main body end */
    if (subBody) {
      Array.prototype.slice.call(subBody.querySelectorAll('script')).forEach(function(scr) {
        doc.body.appendChild(doc.importNode(scr, true));
      });
    }

    /* convert nav links pointing to this sub-app into in-page anchors */
    var sels = 'a[data-subapp-link="' + slug + '"], a[href="apps/' + slug + '/index.html"]';
    doc.querySelectorAll(sels).forEach(function(a) { a.setAttribute('href', '#' + slug); });
  });

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

function buildCombined() {
  var paths = Object.keys(combFiles);
  if (!paths.length) { combResult = ''; return; }
  var missing = [];
  var out = combineRecursive(combFiles, '', missing);
  if (!out) {
    /* fallback: legacy flat mode — find any html and inline its assets */
    var hp = paths.find(function(p) { return /\.html?$/i.test(p); });
    if (!hp) { combResult = '<!-- No HTML file found -->'; return; }
    out = combFiles[hp];
  }
  combResult = out;

  if (missing.length) {
    var uniq = missing.filter(function(v, i, a) { return a.indexOf(v) === i; });
    document.getElementById('imgPrompt').style.display = '';
    document.getElementById('missingList').innerHTML = uniq.map(function(s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('');
  } else {
    document.getElementById('imgPrompt').style.display = 'none';
  }
}

function downloadCombined() {
  if (!combResult) return;
  var out = minifyOn ? minifyHtml(combResult) : combResult;
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out], { type: 'text/html' }));
  a.download = 'combined.html'; a.click();
}

function resetCombine() {
  combFiles = {}; combResult = ''; extraImgs = {};
  hide('combEd'); flex('combIn');
  document.getElementById('imgPrompt').style.display = 'none';
  sbEmpty(); refreshFoot();
}

/* ════════════════════════════════════
   AI ASSISTANT (canned)
════════════════════════════════════ */
function toggleAI() {
  aiOpen = !aiOpen;
  document.getElementById('aiPanel').style.display = aiOpen ? 'flex' : 'none';
  document.getElementById('aiToggle').className = 'tb-ai' + (aiOpen ? ' on' : '');
  if (aiOpen) renderAI();
}

function renderAI() {
  var body = document.getElementById('aiBody'); body.innerHTML = '';
  aiChat.forEach(function(m) {
    var b = document.createElement('div');
    b.className = 'ai-bubble ' + (m.from === 'user' ? 'ai-user' : 'ai-bot');
    b.textContent = m.text;
    body.appendChild(b);
  });
  if (curFile && splitFiles[curFile] && !/^data:image/.test(splitFiles[curFile])) {
    var iss = analyzeCode(splitFiles[curFile], fileKindOf(curFile));
    if (iss.length) {
      var d = document.createElement('div'); d.className = 'ai-bubble ai-issues';
      var html = '<strong>Detected in ' + escapeHtml(curFile) + ':</strong><ul>';
      iss.forEach(function(i) { html += '<li>' + escapeHtml(i.message) + (i.suggestion ? ' — ' + escapeHtml(i.suggestion) : '') + '</li>'; });
      html += '</ul>';
      d.innerHTML = html;
      body.appendChild(d);
    }
  }
  body.scrollTop = body.scrollHeight;
}

function sendAI() {
  var inp = document.getElementById('aiInput');
  var q = inp.value.trim(); if (!q) return;
  aiChat.push({ from: 'user', text: q }); inp.value = '';
  var hasIssues = false;
  if (curFile && splitFiles[curFile] && !/^data:image/.test(splitFiles[curFile])) {
    hasIssues = analyzeCode(splitFiles[curFile], fileKindOf(curFile)).length > 0;
  }
  var reply = cannedAi(q, hasIssues);
  renderAI();
  setTimeout(function() { aiChat.push({ from: 'bot', text: reply }); renderAI(); }, 280);
}

function cannedAi(q, hasIssues) {
  var t = q.toLowerCase();
  if (t.indexOf('error') >= 0 || t.indexOf('fix') >= 0 || t.indexOf('wrong') >= 0) {
    return hasIssues
      ? "I spotted issues in the file you have open — looks like a bracket/tag count mismatch. Check the issues badge in the toolbar."
      : "Everything looks structurally clean. No mismatched braces or tags.";
  }
  if (t.indexOf('tab') >= 0 || t.indexOf('sub') >= 0) {
    return "On the input screen, any tabs I detect show up with checkboxes. Tick the ones to split into their own folder under apps/<slug>/ — each with its own index.html, css/, js/, and images/.";
  }
  if (t.indexOf('image') >= 0) {
    return "On split, base64 images in <img> and CSS url() are extracted into images/ folders (one per app or sub-app) and the references are rewritten. On combine, images are embedded back as base64 inside the single HTML.";
  }
  if (t.indexOf('split') >= 0 || t.indexOf('how') >= 0) {
    return "Drop your single HTML file in, hit Split. Inline <style>/<script> become css/main.css + js/main.js, images go into images/, and any tab you tick becomes apps/<slug>/ with the same structure.";
  }
  if (t.indexOf('preview') >= 0) {
    return "Click the Preview button to toggle the live iframe pane. It stays toggled across both Split and Combine views.";
  }
  if (t.indexOf('download') >= 0 || t.indexOf('zip') >= 0) {
    return "Split gives you a ZIP. Combine gives you one HTML file with all CSS, JS, and base64 images inlined.";
  }
  if (t.indexOf('combine') >= 0) {
    return "Switch to Combine and drop a ZIP. I find index.html, inline its CSS/JS and base64 its images, and recursively flatten any apps/ sub-folders into the same single HTML.";
  }
  return "I'm a simulated assistant with canned responses — ask me about errors, tabs, splitting, combining, images, the preview, or downloads.";
}

/* ════════════════════════════════════
   UTILS
════════════════════════════════════ */
function hide(id)      { var e = document.getElementById(id); if (e) e.style.display = 'none'; }
function showEl(id)    { var e = document.getElementById(id); if (e) e.style.display = ''; }
function flex(id)      { var e = document.getElementById(id); if (e) e.style.display = 'flex'; }
function vis(id, show) { var e = document.getElementById(id); if (e) e.style.display = show ? '' : 'none'; }
function fmtSz(b)      { return b < 1024 ? b + ' B' : Math.round(b / 1024) + ' KB'; }

window.sendToEditor = function(){
  var files = mode==='split' ? splitFiles : (combResult ? {'index.html':combResult} : {});
  var entries = Object.keys(files).map(function(k){return{path:k,content:files[k]};});
  if(!entries.length){alert('Nothing to send yet.');return;}
  var existing=[];try{existing=JSON.parse(localStorage.getItem('nc_files')||'[]');}catch(e){}
  var ts=Date.now();
  entries.forEach(function(e){
    if(e.content&&e.content.startsWith&&e.content.startsWith('data:'))return;
    var name=e.path.split('/').pop();
    var ext=name.split('.').pop();
    var langMap={js:'javascript',ts:'typescript',html:'html',css:'css',json:'json',md:'markdown'};
    var obj={id:ts+'-'+name,name:name,lang:langMap[ext]||'text',content:e.content};
    var idx=existing.findIndex(function(f){return f.name===name;});
    if(idx>=0)existing[idx]=obj;else existing.push(obj);
  });
  localStorage.setItem('nc_files',JSON.stringify(existing));
  try{parent.postMessage({type:'atlas-open',app:'editor'},'*');}catch(e){}
  alert('Sent '+entries.length+' file(s) to Editor!');
};