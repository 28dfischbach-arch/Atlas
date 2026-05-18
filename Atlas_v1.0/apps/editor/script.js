// NoteCode - script.js

const $ = id => document.getElementById(id);

// Monaco globals
let _suppressMonacoChange = false;
let _pendingRender = false;

// ---- State ----
const state = {
  files: {},
  activeFile: null,
  openTabs: [],
  theme: 'dark',
  sidebarVisible: true,
  aiPanelVisible: false,
  previewVisible: false,
  terminalVisible: false,
  termHistory: [],
  termHistoryIndex: -1,
  aiMessages: [],
  aiModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
  includeContext: false,
  findVisible: false,
  findMatches: [],
  findIndex: 0,
  fsHandles: {},
  dirHandle: null,
  cursor: { line: 1, col: 1 },
};

// ---- Language detection ----
function getLang(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return {
    js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',
    ts:'typescript',tsx:'typescript',
    html:'html',htm:'html',
    css:'css',scss:'css',sass:'css',
    json:'json',
    md:'markdown',markdown:'markdown',
    py:'python',
    txt:'text',
    xml:'xml',svg:'xml',
    sh:'shell',bash:'shell',
    c:'c',h:'c',
    cpp:'cpp',cc:'cpp',
    java:'java',
    rs:'rust',
    go:'go',
    rb:'ruby',
    php:'php',
    yaml:'yaml',yml:'yaml',
    toml:'toml',
    sql:'sql',
  }[ext] || 'text';
}

function getFileColor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    js:'#f1e05a',jsx:'#f1e05a',ts:'#3178c6',tsx:'#3178c6',
    html:'#e34c26',css:'#563d7c',scss:'#c6538c',
    json:'#cbcb41',md:'#083fa1',py:'#3572a5',
    go:'#00add8',rs:'#dea584',java:'#b07219',rb:'#701516',
    cpp:'#f34b7d',c:'#555555',php:'#4f5d95',
    sh:'#89e051',sql:'#e38c00',
  };
  return map[ext] || '#858585';
}

// File SVG icon (small colored square with letter)
function fileIconSVG(name) {
  const color = getFileColor(name);
  const ext = (name.split('.').pop() || '?').slice(0,2).toUpperCase();
  return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1" y="1" width="12" height="12" rx="1" fill="${color}" opacity="0.15"/>
    <rect x="1" y="1" width="12" height="12" rx="1" stroke="${color}" stroke-width="1" fill="none"/>
    <text x="7" y="10" font-size="6" text-anchor="middle" fill="${color}" font-family="Consolas,monospace" font-weight="bold">${ext}</text>
  </svg>`;
}

function folderIconSVG(open) {
  return open
    ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 4.5C1 3.67 1.67 3 2.5 3H5.5L6.5 4H11.5C12.33 4 13 4.67 13 5.5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V4.5Z" fill="#dcb67a" opacity="0.9"/>
      </svg>`
    : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 4.5C1 3.67 1.67 3 2.5 3H5.5L6.5 4H11.5C12.33 4 13 4.67 13 5.5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V4.5Z" fill="#c8a55a" opacity="0.7"/>
      </svg>`;
}

function arrowSVG() {
  return `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M4 3l4 3-4 3V3z"/></svg>`;
}

// ---- Syntax highlight ----
function highlight(code, lang) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (!lang || lang === 'text') return esc(code);

  const kwMap = {
    javascript: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|delete|typeof|instanceof|in|of|class|extends|import|export|default|from|async|await|try|catch|finally|throw|this|super|static|get|set|null|undefined|true|false|void|yield',
    typescript: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|delete|typeof|instanceof|in|of|class|extends|import|export|default|from|async|await|try|catch|finally|throw|this|super|static|get|set|null|undefined|true|false|void|yield|interface|type|enum|namespace|declare|abstract|readonly|private|public|protected|as|keyof|infer|never|unknown|any',
    python: 'def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|raise|with|lambda|yield|pass|break|continue|True|False|None|self|super|global|nonlocal|del|assert|async|await',
    java: 'public|private|protected|static|final|class|interface|extends|implements|return|if|else|for|while|do|switch|case|break|continue|new|null|true|false|void|int|long|double|float|boolean|String|import|package|try|catch|finally|throw|throws|this|super|abstract|synchronized|instanceof',
    go: 'func|return|if|else|for|range|switch|case|break|continue|var|const|type|struct|interface|import|package|go|defer|select|chan|map|make|new|nil|true|false|error|string|int|int64|float64|bool|byte|rune',
    rust: 'fn|let|mut|if|else|match|for|while|loop|return|use|mod|struct|enum|impl|trait|pub|crate|super|self|type|where|async|await|unsafe|extern|true|false|const|static|ref|move',
    python: 'def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|raise|with|lambda|yield|pass|break|continue|True|False|None|self|async|await',
    ruby: 'def|class|module|return|if|elsif|else|unless|for|while|until|do|end|begin|rescue|ensure|raise|yield|self|nil|true|false|require|include|extend|puts|print',
    php: 'echo|print|if|else|elseif|for|foreach|while|do|switch|case|break|continue|function|return|class|extends|implements|new|null|true|false|public|private|protected|static|abstract|namespace|use|require|include',
    sql: 'SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|IS|IN|LIKE|BETWEEN|DISTINCT|COUNT|SUM|AVG|MAX|MIN|INTO|VALUES|SET|PRIMARY|KEY|FOREIGN|UNIQUE|DEFAULT',
    shell: 'if|then|else|elif|fi|for|do|done|while|case|esac|function|return|export|local|echo|read|exit|source|alias',
    yaml: 'true|false|null|yes|no',
    toml: 'true|false',
    c: 'int|char|float|double|void|return|if|else|for|while|do|switch|case|break|continue|struct|typedef|enum|const|static|extern|sizeof|include|define|ifdef|ifndef|endif|long|short|unsigned|signed',
    cpp: 'int|char|float|double|void|return|if|else|for|while|do|switch|case|break|continue|struct|class|typedef|enum|const|static|extern|sizeof|namespace|using|new|delete|this|public|private|protected|virtual|override|template|typename|auto|nullptr|true|false',
  };

  let e = esc(code);

  if (lang === 'html' || lang === 'xml') {
    return e
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="cm">$1</span>')
      .replace(/(&lt;\/?)([\w\-:.]+)/g, '<span class="tg">$1$2</span>')
      .replace(/\s([\w\-:]+)(?==)/g, ' <span class="at">$1</span>')
      .replace(/("[^"]*")/g, '<span class="st">$1</span>');
  }

  if (lang === 'css') {
    return e
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="cm">$1</span>')
      .replace(/("[^"]*"|'[^']*')/g, '<span class="st">$1</span>')
      .replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="nm">$1</span>')
      .replace(/\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms)?)\b/g, '<span class="nm">$1</span>')
      .replace(/([\w-]+)\s*(?=:(?!:))/g, '<span class="pr">$1</span>')
      .replace(/(!important)/g, '<span class="kw">$1</span>');
  }

  const kw = kwMap[lang] || kwMap['javascript'];

  // Tokenize: process in order — comments, strings, then keywords/numbers
  const tokens = [];
  const src = e;
  let i = 0;

  const commentLine = (lang === 'python' || lang === 'ruby' || lang === 'shell' || lang === 'yaml' || lang === 'toml') ? '#' : '//';
  const commentBlock = ['javascript','typescript','java','go','c','cpp','rust','php','css'].includes(lang);
  const hashComment = ['python','ruby','shell','yaml','toml'].includes(lang);
  const sqlComment = lang === 'sql';

  while (i < src.length) {
    // Block comment
    if (commentBlock && src.startsWith('\/\/', i)) {
      // Actually we're in escaped HTML — look for literal //
    }

    // We work on the escaped string — detect comment markers
    let matched = false;

    // Line comment //
    if (!hashComment && !sqlComment && src.slice(i, i+2) === '//') {
      const end = src.indexOf('\n', i);
      const slice = end === -1 ? src.slice(i) : src.slice(i, end);
      tokens.push(`<span class="cm">${slice}</span>`);
      i += slice.length;
      matched = true;
    }
    // Block comment /* */
    if (!matched && commentBlock && src.slice(i, i+2) === '/*') {
      const end = src.indexOf('*/', i + 2);
      const slice = end === -1 ? src.slice(i) : src.slice(i, end + 2);
      tokens.push(`<span class="cm">${slice}</span>`);
      i += slice.length;
      matched = true;
    }
    // Hash comment #
    if (!matched && hashComment && src[i] === '#') {
      const end = src.indexOf('\n', i);
      const slice = end === -1 ? src.slice(i) : src.slice(i, end);
      tokens.push(`<span class="cm">${slice}</span>`);
      i += slice.length;
      matched = true;
    }
    // SQL comment --
    if (!matched && sqlComment && src.slice(i, i+2) === '--') {
      const end = src.indexOf('\n', i);
      const slice = end === -1 ? src.slice(i) : src.slice(i, end);
      tokens.push(`<span class="cm">${slice}</span>`);
      i += slice.length;
      matched = true;
    }
    // Strings " ' `
    if (!matched && (src[i] === '"' || src[i] === "'" || src[i] === '`')) {
      const q = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      tokens.push(`<span class="st">${src.slice(i, j)}</span>`);
      i = j;
      matched = true;
    }

    if (!matched) {
      // Accumulate a word or character
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      if (j > i) {
        const word = src.slice(i, j);
        const kwRe = new RegExp(`^(${kw})$`);
        if (kwRe.test(word)) {
          tokens.push(`<span class="kw">${word}</span>`);
        } else if (/^\d/.test(word)) {
          tokens.push(`<span class="nm">${word}</span>`);
        } else {
          // Check if followed by (
          const afterWord = src.slice(j).trimStart();
          if (afterWord.startsWith('(')) {
            tokens.push(`<span class="fn">${word}</span>`);
          } else {
            tokens.push(word);
          }
        }
        i = j;
      } else {
        tokens.push(src[i]);
        i++;
      }
    }
  }

  return tokens.join('');
}

// ---- Monaco language map ----
function getMonacoLang(lang) {
  return {
    javascript: 'javascript', typescript: 'typescript',
    html: 'html', css: 'css', json: 'json',
    markdown: 'markdown', python: 'python',
    xml: 'xml', shell: 'shell', c: 'c',
    cpp: 'cpp', java: 'java', rust: 'rust',
    go: 'go', ruby: 'ruby', php: 'php',
    yaml: 'yaml', toml: 'ini', sql: 'sql', text: 'plaintext',
  }[lang] || 'plaintext';
}

// ---- Open file ----
function openFile(path) {
  const file = state.files[path];
  if (!file) return;
  state.activeFile = path;
  if (!state.openTabs.includes(path)) state.openTabs.push(path);
  renderTabs();
  renderFileTree();
  renderEditor();
  renderBreadcrumb(path);
  updateStatus();
  $('welcome-screen').classList.add('hidden');
  $('editor-container').style.display = 'flex';
}

function renderEditor() {
  if (!state.activeFile) return;
  if (!window.monacoEditor) { _pendingRender = true; return; }
  const file = state.files[state.activeFile];
  if (!file) return;
  _suppressMonacoChange = true;
  monacoEditor.setValue(file.content);
  monaco.editor.setModelLanguage(monacoEditor.getModel(), getMonacoLang(file.language));
  _suppressMonacoChange = false;
  monacoEditor.setScrollPosition({ scrollTop: 0 });
}

function renderBreadcrumb(path) {
  const parts = path.split('/');
  $('breadcrumb').innerHTML = parts.map((p, i) => {
    const last = i === parts.length - 1;
    return (i > 0 ? '<span class="bc-sep">›</span>' : '') +
      `<span class="${last ? 'bc-file' : ''}">${p}</span>`;
  }).join('');
}

// ---- Tabs ----
function renderTabs() {
  const bar = $('tabs-bar');
  bar.innerHTML = '';
  state.openTabs.forEach(path => {
    const file = state.files[path];
    if (!file) return;
    const tab = document.createElement('div');
    tab.className = 'tab' + (path === state.activeFile ? ' active' : '');

    const iconDiv = document.createElement('div');
    iconDiv.className = 'tab-icon';
    iconDiv.innerHTML = fileIconSVG(file.name);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = file.name;

    tab.appendChild(iconDiv);
    tab.appendChild(nameSpan);

    if (file.dirty) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty-dot';
      tab.appendChild(dot);
    } else {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Close';
      closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(path); });
      tab.appendChild(closeBtn);
    }

    tab.addEventListener('click', () => openFile(path));
    bar.appendChild(tab);
  });

  // "+" button to create a new file
  const addBtn = document.createElement('button');
  addBtn.className = 'tab-add-btn';
  addBtn.title = 'New File (Ctrl+N)';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', newFile);
  bar.appendChild(addBtn);
}

function closeTab(path) {
  const idx = state.openTabs.indexOf(path);
  if (idx === -1) return;
  state.openTabs.splice(idx, 1);
  if (state.activeFile === path) {
    state.activeFile = state.openTabs[Math.min(idx, state.openTabs.length - 1)] || null;
    if (state.activeFile) {
      renderEditor();
      renderBreadcrumb(state.activeFile);
    } else {
      showWelcome();
    }
  }
  renderTabs();
  renderFileTree();
  updateStatus();
}

function showWelcome() {
  $('welcome-screen').classList.remove('hidden');
  $('editor-container').style.display = 'none';
  $('breadcrumb').innerHTML = '';
}

// ---- File tree ----
function renderFileTree() {
  const tree = $('file-tree');
  tree.innerHTML = '';

  const paths = Object.keys(state.files).sort();
  if (paths.length === 0) {
    tree.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--text-secondary);opacity:0.5;text-align:center;">No folder open</div>`;
    return;
  }

  // Build folder tree structure
  const root = {};
  paths.forEach(p => {
    const parts = p.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { _children: {} };
      node = node[parts[i]]._children;
    }
    node[parts[parts.length - 1]] = { _file: p };
  });

  renderTreeNode(tree, root, 0);
}

function renderTreeNode(container, node, depth, pathPrefix) {
  pathPrefix = pathPrefix || '';
  const indent = depth * 12 + 8;

  const folders = Object.keys(node).filter(k => node[k]._children !== undefined).sort();
  const files = Object.keys(node).filter(k => node[k]._file !== undefined).sort();

  folders.forEach(name => {
    const folderPath = pathPrefix ? `${pathPrefix}/${name}` : name;
    const child = node[name];
    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item';

    const arrowEl = document.createElement('div');
    arrowEl.className = 'tree-folder-arrow open';
    arrowEl.innerHTML = arrowSVG();
    arrowEl.style.marginLeft = indent + 'px';

    const iconEl = document.createElement('div');
    iconEl.className = 'tree-item-icon';
    iconEl.innerHTML = folderIconSVG(true);

    const nameEl = document.createElement('div');
    nameEl.className = 'tree-item-name';
    nameEl.textContent = name;

    itemEl.appendChild(arrowEl);
    itemEl.appendChild(iconEl);
    itemEl.appendChild(nameEl);

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children open';
    renderTreeNode(childContainer, child._children, depth + 1, folderPath);

    itemEl.addEventListener('click', () => {
      const isOpen = arrowEl.classList.contains('open');
      arrowEl.classList.toggle('open', !isOpen);
      iconEl.innerHTML = folderIconSVG(!isOpen);
      childContainer.classList.toggle('open', !isOpen);
    });

    itemEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      showFolderContextMenu(e, folderPath);
    });

    container.appendChild(itemEl);
    container.appendChild(childContainer);
  });

  files.forEach(name => {
    const filePath = node[name]._file;
    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item' + (filePath === state.activeFile ? ' selected' : '');

    const spacer = document.createElement('div');
    spacer.style.width = (indent + 16) + 'px';
    spacer.style.flexShrink = '0';

    const iconEl = document.createElement('div');
    iconEl.className = 'tree-item-icon';
    iconEl.innerHTML = fileIconSVG(name);

    const nameEl = document.createElement('div');
    nameEl.className = 'tree-item-name';
    nameEl.textContent = name;

    itemEl.appendChild(spacer);
    itemEl.appendChild(iconEl);
    itemEl.appendChild(nameEl);

    itemEl.addEventListener('click', () => openFile(filePath));
    itemEl.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, filePath); });
    container.appendChild(itemEl);
  });
}

// ---- Open folder ----
async function openFolder() {
  if (!window.showDirectoryPicker) {
    showToast('File System Access not supported. Use Chrome or Edge.');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.dirHandle = dirHandle;
    state.files = {};
    state.fsHandles = {};
    state.openTabs = [];
    state.activeFile = null;

    await readDir(dirHandle, '');

    $('sidebar-folder-name').textContent = dirHandle.name.toUpperCase();
    renderFileTree();
    renderTabs();
    showWelcome();
    updateStatus();
    showToast('Opened: ' + dirHandle.name);
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Error: ' + e.message);
  }
}

async function readDir(handle, prefix, depth = 0) {
  if (depth > 6) return;
  for await (const [name, h] of handle.entries()) {
    if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (h.kind === 'file') {
      try {
        const f = await h.getFile();
        if (isText(name) && f.size < 2 * 1024 * 1024) {
          state.files[path] = { name, content: await f.text(), language: getLang(name), dirty: false };
          state.fsHandles[path] = h;
        }
      } catch {}
    } else if (h.kind === 'directory') {
      await readDir(h, path, depth + 1);
    }
  }
}

function isText(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['js','jsx','ts','tsx','html','htm','css','scss','sass','json','md','markdown','txt','py','rb','php','go','rs','c','h','cpp','cc','java','sh','bash','yaml','yml','toml','sql','xml','svg','vue','svelte','astro','gitignore','env','prettierrc','eslintrc','babelrc','editorconfig','lock','config'].includes(ext)
    || !name.includes('.');
}

// ---- Ensure write permission on a file handle ----
async function ensureWritePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

// ---- Get or create a file handle inside the open directory ----
async function getHandleForPath(filePath) {
  if (!state.dirHandle) return null;
  const parts = filePath.split('/');
  let dir = state.dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    } catch { return null; }
  }
  try {
    return await dir.getFileHandle(parts[parts.length - 1], { create: true });
  } catch { return null; }
}

// ---- New file ----
async function newFile() {
  const name = prompt('File name:');
  if (!name || !name.trim()) return;
  const filePath = name.trim();

  state.files[filePath] = { name: filePath.split('/').pop(), content: '', language: getLang(filePath), dirty: false };

  // If a folder is open, actually create the file on disk
  if (state.dirHandle) {
    try {
      const handle = await getHandleForPath(filePath);
      if (handle) {
        const ok = await ensureWritePermission(handle);
        if (ok) {
          const w = await handle.createWritable();
          await w.write('');
          await w.close();
          state.fsHandles[filePath] = handle;
          showToast('Created: ' + filePath);
        }
      }
    } catch (e) {
      showToast('Could not create on disk: ' + e.message);
    }
  }

  renderFileTree();
  openFile(filePath);
}

// ---- Save file — writes directly back to disk ----
async function saveFile() {
  if (!state.activeFile) return;
  const file = state.files[state.activeFile];
  if (!file) return;

  let handle = state.fsHandles[state.activeFile];

  // Try to get a handle if we have a dir open but no handle yet for this file
  if (!handle && state.dirHandle) {
    handle = await getHandleForPath(state.activeFile);
    if (handle) state.fsHandles[state.activeFile] = handle;
  }

  if (handle) {
    try {
      const ok = await ensureWritePermission(handle);
      if (!ok) {
        showToast('Write permission denied — allow access in the browser prompt');
        return;
      }
      const w = await handle.createWritable();
      await w.write(file.content);
      await w.close();
      file.dirty = false;
      renderTabs();
      showToast('Saved: ' + file.name);
    } catch (e) {
      showToast('Save failed: ' + e.message);
    }
  } else {
    // No folder open — prompt user to pick a save location
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: file.name });
        const ok = await ensureWritePermission(h);
        if (!ok) { showToast('Permission denied'); return; }
        const w = await h.createWritable();
        await w.write(file.content);
        await w.close();
        state.fsHandles[state.activeFile] = h;
        file.dirty = false;
        renderTabs();
        showToast('Saved: ' + file.name);
      } catch (e) {
        if (e.name !== 'AbortError') showToast('Save failed: ' + e.message);
      }
    } else {
      showToast('Open a folder first to enable direct file saving');
    }
  }
}

// ---- Monaco Editor init ----
function initEditor() {
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    window.monacoEditor = monaco.editor.create($('code-editor'), {
      value: '',
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      tabSize: 2,
      insertSpaces: true,
      renderWhitespace: 'selection',
      cursorBlinking: 'smooth',
      cursorStyle: 'line',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnType: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    });

    monacoEditor.onDidChangeModelContent(() => {
      if (_suppressMonacoChange) return;
      if (!state.activeFile) return;
      const file = state.files[state.activeFile];
      if (!file) return;
      file.content = monacoEditor.getValue();
      if (!file.dirty) { file.dirty = true; renderTabs(); }
      updateStatus();
    });

    monacoEditor.onDidChangeCursorPosition(e => {
      state.cursor.line = e.position.lineNumber;
      state.cursor.col = e.position.column;
      updateStatus();
    });

    // Override Ctrl+S and Ctrl+F inside Monaco
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());
    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      e => e && e.preventDefault && e.preventDefault();
      toggleFind();
    });

    if (_pendingRender) {
      _pendingRender = false;
      renderEditor();
    }
  });
}

function updateCursor() {
  if (!window.monacoEditor) return;
  const pos = monacoEditor.getPosition();
  if (pos) {
    state.cursor.line = pos.lineNumber;
    state.cursor.col = pos.column;
  }
  updateStatus();
}

// ---- Status bar ----
function updateStatus() {
  const file = state.activeFile ? state.files[state.activeFile] : null;
  const lang = file ? (file.language.charAt(0).toUpperCase() + file.language.slice(1)) : 'Plain Text';
  const dirty = file && file.dirty ? ' ●' : '';
  $('status-lang').textContent = lang;
  $('status-cursor').textContent = `Ln ${state.cursor.line}, Col ${state.cursor.col}`;
  $('status-file').textContent = file ? file.name + dirty : '';
}

// ---- Find & Replace ----
function toggleFind() {
  state.findVisible = !state.findVisible;
  const bar = $('find-bar');
  bar.classList.toggle('visible', state.findVisible);
  if (state.findVisible) $('find-input').focus();
  else { $('find-count').textContent = ''; state.findMatches = []; }
}

function doFind() {
  const term = $('find-input').value;
  state.findMatches = [];
  state.findIndex = 0;
  if (!term || !window.monacoEditor) { $('find-count').textContent = ''; return; }
  const model = monacoEditor.getModel();
  if (!model) return;
  const matches = model.findMatches(term, true, false, false, null, true);
  state.findMatches = matches;
  $('find-count').textContent = matches.length
    ? `1 / ${matches.length}`
    : 'No results';
  if (matches.length) {
    monacoEditor.setSelection(matches[0].range);
    monacoEditor.revealLineInCenter(matches[0].range.startLineNumber);
    monacoEditor.focus();
  }
}

function findNext() {
  if (!state.findMatches.length || !window.monacoEditor) return;
  state.findIndex = (state.findIndex + 1) % state.findMatches.length;
  const m = state.findMatches[state.findIndex];
  monacoEditor.setSelection(m.range);
  monacoEditor.revealLineInCenter(m.range.startLineNumber);
  $('find-count').textContent = `${state.findIndex + 1} / ${state.findMatches.length}`;
}

function findPrev() {
  if (!state.findMatches.length || !window.monacoEditor) return;
  state.findIndex = (state.findIndex - 1 + state.findMatches.length) % state.findMatches.length;
  const m = state.findMatches[state.findIndex];
  monacoEditor.setSelection(m.range);
  monacoEditor.revealLineInCenter(m.range.startLineNumber);
  $('find-count').textContent = `${state.findIndex + 1} / ${state.findMatches.length}`;
}

function highlightMatch() { /* handled by Monaco selection */ }

function doReplaceAll() {
  const term = $('find-input').value;
  const repl = $('replace-input').value;
  if (!term || !state.activeFile || !window.monacoEditor) return;
  const model = monacoEditor.getModel();
  const matches = model.findMatches(term, true, false, false, null, true);
  if (!matches.length) { showToast('No matches found'); return; }
  _suppressMonacoChange = true;
  model.pushEditOperations([], matches.map(m => ({ range: m.range, text: repl })), () => null);
  _suppressMonacoChange = false;
  const file = state.files[state.activeFile];
  file.content = monacoEditor.getValue();
  file.dirty = true;
  renderTabs();
  doFind();
  showToast(`Replaced ${matches.length} occurrence${matches.length !== 1 ? 's' : ''}`);
}

// ---- New Folder ----
async function newFolder(targetPath) {
  const name = prompt('Folder name:');
  if (!name || !name.trim()) return;
  const base = targetPath ? targetPath + '/' + name.trim() : name.trim();

  if (state.dirHandle) {
    try {
      const parts = base.split('/');
      let dir = state.dirHandle;
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: true });
      }
      showToast('Folder created: ' + base);
    } catch (e) {
      showToast('Could not create folder: ' + e.message);
      return;
    }
  }

  // Add a placeholder so the folder shows in the tree
  const placeholderPath = base + '/.notecode';
  state.files[placeholderPath] = { name: '.notecode', content: '', language: 'text', dirty: false };
  renderFileTree();
}

// ---- Upload Files ----
async function uploadFiles(targetFolderPath) {
  const input = $('upload-input');
  input.onchange = async () => {
    const fileList = Array.from(input.files);
    if (!fileList.length) return;

    for (const file of fileList) {
      const filePath = targetFolderPath ? `${targetFolderPath}/${file.name}` : file.name;
      const content = await file.text().catch(() => '');

      state.files[filePath] = {
        name: file.name,
        content,
        language: getLang(file.name),
        dirty: false,
      };

      // Write to disk if a folder is open
      if (state.dirHandle) {
        try {
          const handle = await getHandleForPath(filePath);
          if (handle) {
            const ok = await ensureWritePermission(handle);
            if (ok) {
              const w = await handle.createWritable();
              await w.write(content);
              await w.close();
              state.fsHandles[filePath] = handle;
            }
          }
        } catch {}
      }
    }

    renderFileTree();
    showToast(`Uploaded ${fileList.length} file${fileList.length !== 1 ? 's' : ''}`);
    input.value = '';
  };
  input.click();
}

// ---- Context menu (files) ----
function showContextMenu(e, filePath) {
  e.stopPropagation();
  const menu = $('context-menu');
  const parentFolder = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : null;

  menu.innerHTML = `
    <div class="ctx-item" data-action="open">Open</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="new-file">New File Here</div>
    <div class="ctx-item" data-action="new-folder">New Folder Here</div>
    <div class="ctx-item" data-action="upload">Upload Here</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="rename">Rename</div>
    <div class="ctx-item" data-action="delete">Delete</div>
  `;
  positionMenu(menu, e);
  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', () => {
      menu.classList.remove('visible');
      switch (item.dataset.action) {
        case 'open': openFile(filePath); break;
        case 'new-file': newFileIn(parentFolder); break;
        case 'new-folder': newFolder(parentFolder); break;
        case 'upload': uploadFiles(parentFolder); break;
        case 'rename': renameFile(filePath); break;
        case 'delete': deleteFile(filePath); break;
      }
    });
  });
}

// ---- Context menu (folders) ----
function showFolderContextMenu(e, folderPath) {
  e.preventDefault();
  e.stopPropagation();
  const menu = $('context-menu');
  menu.innerHTML = `
    <div class="ctx-item" data-action="new-file">New File Here</div>
    <div class="ctx-item" data-action="new-folder">New Folder Here</div>
    <div class="ctx-item" data-action="upload">Upload Here</div>
  `;
  positionMenu(menu, e);
  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', () => {
      menu.classList.remove('visible');
      switch (item.dataset.action) {
        case 'new-file': newFileIn(folderPath); break;
        case 'new-folder': newFolder(folderPath); break;
        case 'upload': uploadFiles(folderPath); break;
      }
    });
  });
}

// ---- Right-click on empty sidebar space ----
function onTreeBgRightClick(e) {
  if (e.target.closest('.tree-item')) return;
  e.preventDefault();
  const menu = $('context-menu');
  menu.innerHTML = `
    <div class="ctx-item" data-action="open-folder">Open Folder</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="new-file">New File</div>
    <div class="ctx-item" data-action="new-folder">New Folder</div>
    <div class="ctx-item" data-action="upload">Upload Files</div>
  `;
  positionMenu(menu, e);
  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', () => {
      menu.classList.remove('visible');
      switch (item.dataset.action) {
        case 'open-folder': openFolder(); break;
        case 'new-file': newFile(); break;
        case 'new-folder': newFolder(null); break;
        case 'upload': uploadFiles(null); break;
      }
    });
  });
}

function positionMenu(menu, e) {
  menu.classList.add('visible');
  const x = Math.min(e.clientX, window.innerWidth - 210);
  const y = Math.min(e.clientY, window.innerHeight - 180);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

// ---- New file inside a specific folder ----
async function newFileIn(folderPath) {
  const name = prompt('File name:');
  if (!name || !name.trim()) return;
  const filePath = folderPath ? `${folderPath}/${name.trim()}` : name.trim();
  state.files[filePath] = { name: name.trim(), content: '', language: getLang(name.trim()), dirty: false };

  if (state.dirHandle) {
    try {
      const handle = await getHandleForPath(filePath);
      if (handle) {
        const ok = await ensureWritePermission(handle);
        if (ok) {
          const w = await handle.createWritable();
          await w.write('');
          await w.close();
          state.fsHandles[filePath] = handle;
        }
      }
    } catch (e) {
      showToast('Created in memory only: ' + e.message);
    }
  }

  renderFileTree();
  openFile(filePath);
}

function renameFile(path) {
  const file = state.files[path];
  const newName = prompt('Rename:', file.name);
  if (!newName || newName === file.name) return;
  const parts = path.split('/');
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');
  state.files[newPath] = { ...file, name: newName, language: getLang(newName) };
  delete state.files[path];
  if (state.fsHandles[path]) { state.fsHandles[newPath] = state.fsHandles[path]; delete state.fsHandles[path]; }
  const ti = state.openTabs.indexOf(path);
  if (ti !== -1) state.openTabs[ti] = newPath;
  if (state.activeFile === path) state.activeFile = newPath;
  renderFileTree();
  renderTabs();
}

function deleteFile(path) {
  if (!confirm(`Delete "${state.files[path].name}"?`)) return;
  delete state.files[path];
  delete state.fsHandles[path];
  if (state.openTabs.includes(path)) closeTab(path);
  else renderFileTree();
}

// ---- Theme ----
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.classList.toggle('light', state.theme === 'light');
}

// ---- Sidebar ----
function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  $('sidebar').classList.toggle('hidden', !state.sidebarVisible);
  document.querySelector('.activity-btn[data-panel="explorer"]').classList.toggle('active', state.sidebarVisible);
}

// ---- Preview Panel ----
function togglePreview() {
  state.previewVisible = !state.previewVisible;
  $('preview-panel').classList.toggle('hidden', !state.previewVisible);
  document.querySelector('.activity-btn[data-panel="preview"]').classList.toggle('active', state.previewVisible);
  if (state.previewVisible) refreshPreview();
}

function refreshPreview() {
  const iframe = $('preview-iframe');
  if (!state.activeFile) {
    iframe.srcdoc = '<body style="font-family:sans-serif;padding:20px;color:#888">Open a file and click Preview to render it here.</body>';
    return;
  }
  const file = state.files[state.activeFile];
  if (!file) return;

  if (file.language === 'html') {
    iframe.srcdoc = file.content;
  } else {
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    iframe.srcdoc = `<!DOCTYPE html><html><head><style>
      body{background:#1e1e1e;color:#d4d4d4;font-family:'Consolas','Courier New',monospace;font-size:13px;line-height:1.6;padding:20px;margin:0;white-space:pre-wrap;word-break:break-all;}
    </style></head><body>${esc(file.content)}</body></html>`;
  }
}

// ---- Terminal ----
function toggleTerminal() {
  state.terminalVisible = !state.terminalVisible;
  $('terminal-panel').classList.toggle('hidden', !state.terminalVisible);
  const btn = document.querySelector('.activity-btn[data-panel="terminal"]');
  if (btn) btn.classList.toggle('active', state.terminalVisible);
  if (state.terminalVisible) {
    $('terminal-input').focus();
    if ($('terminal-output').children.length === 0) {
      termPrint('NoteCode JS Terminal — type help for available commands.', 'term-info');
    }
  }
}

function termPrint(text, cls) {
  const out = $('terminal-output');
  const line = document.createElement('div');
  line.className = 'term-line';
  const span = document.createElement('span');
  span.className = cls || 'term-out';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  span.innerHTML = esc(text);
  line.appendChild(span);
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function termClear() {
  $('terminal-output').innerHTML = '';
}

function termFormatValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return v.toString().split('\n')[0] + ' { ... }';
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function runTermCommand(raw) {
  const input = raw.trim();
  if (!input) return;

  // Echo input
  const out = $('terminal-output');
  const echo = document.createElement('div');
  echo.className = 'term-line term-input-echo';
  echo.innerHTML = `<span class="term-prompt-char">&gt;</span> <span>${input.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`;
  out.appendChild(echo);

  // History
  state.termHistory.unshift(input);
  if (state.termHistory.length > 100) state.termHistory.pop();
  state.termHistoryIndex = -1;

  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Built-in commands
  if (cmd === 'help') {
    termPrint('Built-in commands:', 'term-info');
    termPrint('  ls              — list open files', 'term-out');
    termPrint('  cat <file>      — print file content', 'term-out');
    termPrint('  open <file>     — open file in editor', 'term-out');
    termPrint('  pwd             — show open folder', 'term-out');
    termPrint('  clear           — clear terminal', 'term-out');
    termPrint('  help            — show this list', 'term-out');
    termPrint('Anything else is evaluated as JavaScript.', 'term-info');
    return;
  }

  if (cmd === 'clear') { termClear(); return; }

  if (cmd === 'pwd') {
    termPrint(state.dirHandle ? state.dirHandle.name : '(no folder open)', 'term-out');
    return;
  }

  if (cmd === 'ls') {
    const paths = Object.keys(state.files).sort();
    if (!paths.length) { termPrint('(no files)', 'term-info'); return; }
    paths.forEach(p => termPrint(p, 'term-out'));
    return;
  }

  if (cmd === 'cat') {
    const name = args.join(' ');
    if (!name) { termPrint('Usage: cat <filename>', 'term-err'); return; }
    const match = Object.keys(state.files).find(p => p === name || p.endsWith('/' + name));
    if (!match) { termPrint(`cat: ${name}: No such file`, 'term-err'); return; }
    termPrint(state.files[match].content, 'term-out');
    return;
  }

  if (cmd === 'open') {
    const name = args.join(' ');
    if (!name) { termPrint('Usage: open <filename>', 'term-err'); return; }
    const match = Object.keys(state.files).find(p => p === name || p.endsWith('/' + name));
    if (!match) { termPrint(`open: ${name}: No such file`, 'term-err'); return; }
    openFile(match);
    termPrint(`Opened ${match}`, 'term-success');
    return;
  }

  // JavaScript eval — intercept console.log
  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...a) => { logs.push({ t: 'out', v: a.map(termFormatValue).join(' ') }); origLog(...a); };
  console.warn = (...a) => { logs.push({ t: 'out', v: '(warn) ' + a.map(termFormatValue).join(' ') }); origWarn(...a); };
  console.error = (...a) => { logs.push({ t: 'err', v: a.map(termFormatValue).join(' ') }); origError(...a); };

  try {
    // eslint-disable-next-line no-eval
    const result = (0, eval)(input);
    console.log = origLog; console.warn = origWarn; console.error = origError;
    logs.forEach(l => termPrint(l.v, l.t === 'err' ? 'term-err' : 'term-out'));
    if (result !== undefined) termPrint(termFormatValue(result), 'term-success');
  } catch (e) {
    console.log = origLog; console.warn = origWarn; console.error = origError;
    logs.forEach(l => termPrint(l.v, l.t === 'err' ? 'term-err' : 'term-out'));
    termPrint(e.message, 'term-err');
  }

  out.scrollTop = out.scrollHeight;
}

// ---- AI Panel ----
function toggleAI() {
  state.aiPanelVisible = !state.aiPanelVisible;
  $('ai-panel').classList.toggle('hidden', !state.aiPanelVisible);
  document.querySelector('.activity-btn[data-panel="ai"]').classList.toggle('active', state.aiPanelVisible);
}

function getGroqKey() {
  const direct = localStorage.getItem('advisore_groq_key');
  if (direct) return direct;
  try { const a = JSON.parse(localStorage.getItem('atlas_ai') || 'null'); return a && a.groqKey || ''; } catch(e) { return ''; }
}

function refreshAIKeyStatus() {
  const key = getGroqKey();
  const ind = $('ai-key-indicator');
  if (!ind) return;
  if (key) { ind.textContent = 'Ready'; ind.style.background = '#d1fae5'; ind.style.color = '#065f46'; }
  else { ind.textContent = 'No key'; ind.style.background = '#f5f5f7'; ind.style.color = '#86868b'; }
}

// kept as no-op so event listeners don't break
function saveApiKey() { refreshAIKeyStatus(); }

async function sendAI() {
  const input = $('ai-input');
  const msg = input.value.trim();
  if (!msg) return;
  const apiKey = getGroqKey();
  if (!apiKey) { showToast('Add Groq key in Settings → AdvisorE AI'); return; }

  input.value = '';
  $('ai-send').disabled = true;
  state.aiMessages.push({ role: 'user', content: msg });

  const edSettings = (function(){ try{ return JSON.parse(localStorage.getItem('atlas_editor_settings')||'null'); }catch(e){ return null; } })();
  const aiSettings = (function(){ try{ return JSON.parse(localStorage.getItem('atlas_ai')||'null'); }catch(e){ return null; } })();
  const model = (aiSettings && aiSettings.model) || state.aiModel;

  const messages = [
    { role: 'system', content: 'You are a senior software engineer and coding assistant embedded in the Atlas code editor. Write production-quality code with brief explanations. Always use markdown code blocks with the correct language. Be concise and direct — avoid unnecessary prose.' }
  ];

  // Always include active file context
  if (state.activeFile) {
    const f = state.files[state.activeFile];
    if (f) messages.push({ role: 'system', content: `Active file: ${f.name}\n\`\`\`${f.language || 'text'}\n${f.content.slice(0, 4000)}\n\`\`\`` });
  }

  state.aiMessages.forEach(m => messages.push(m));
  renderAI(true);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages, max_tokens: 4096, temperature: 0.4 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    state.aiMessages.push({ role: 'assistant', content: data.choices?.[0]?.message?.content || 'No response.' });
  } catch (e) {
    state.aiMessages.push({ role: 'assistant', content: `⚠ Error: ${e.message}` });
  }

  renderAI(false);
  $('ai-send').disabled = false;
  input.focus();
}

function renderAI(thinking) {
  const c = $('ai-messages');
  c.innerHTML = '';

  if (!state.aiMessages.length) {
    c.innerHTML = '<div class="ai-empty">Ask me anything about your code.\n\nEnter to send, Shift+Enter for new line.</div>';
  }

  state.aiMessages.forEach(m => {
    const div = document.createElement('div');
    div.className = `ai-msg ${m.role}`;
    const role = document.createElement('div');
    role.className = 'ai-msg-role';
    role.textContent = m.role === 'user' ? 'You' : 'NoteCode AI';
    const body = document.createElement('div');
    body.className = 'ai-msg-body';
    body.innerHTML = formatAI(m.content);
    div.appendChild(role);
    div.appendChild(body);
    c.appendChild(div);
  });

  if (thinking) {
    const div = document.createElement('div');
    div.className = 'ai-msg assistant';
    div.innerHTML = `<div class="ai-msg-role">NoteCode AI</div><div class="ai-thinking"><div class="ai-thinking-dot"></div><div class="ai-thinking-dot"></div><div class="ai-thinking-dot"></div></div>`;
    c.appendChild(div);
  }

  c.scrollTop = c.scrollHeight;
}

function formatAI(text) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre style="background:var(--bg-app);padding:8px;border-radius:2px;overflow-x:auto;margin:4px 0;font-size:11px;font-family:Consolas,monospace;border:1px solid var(--border-color);">${esc(code.trim())}</pre>`
  );
  text = text.replace(/`([^`]+)`/g, `<code style="background:var(--bg-app);padding:1px 4px;border-radius:2px;font-size:11px;font-family:Consolas,monospace;">$1</code>`);
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- Global keyboard shortcuts ----
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); toggleFind(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
  if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleAI(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newFile(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') { e.preventDefault(); togglePreview(); }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'j') { e.preventDefault(); toggleTerminal(); }
  if (e.key === 'Escape') {
    state.findVisible = false;
    $('find-bar').classList.remove('visible');
    $('context-menu').classList.remove('visible');
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#context-menu')) $('context-menu').classList.remove('visible');
});

// ---- Sample file ----
function loadSample() {
  state.files['welcome.js'] = {
    name: 'welcome.js',
    language: 'javascript',
    dirty: false,
    content: `// Welcome to NoteCode
// Open a folder with the button in the sidebar, or press Ctrl+N for a new file.

const editor = {
  name: "NoteCode",
  version: "1.0.0",
  features: [
    "Syntax highlighting",
    "Multiple file tabs",
    "Live file editing",
    "Find & Replace",
    "AI assistant",
    "Dark / Light theme",
  ],
};

function greet(name) {
  return \`Hello, \${name}! Welcome to \${editor.name}.\`;
}

console.log(greet("World"));
`,
  };
  renderFileTree();
  openFile('welcome.js');
}

// ---- Menu dropdowns ----
function initMenus() {
  const groups = document.querySelectorAll('.menu-group');
  groups.forEach(group => {
    const btn = group.querySelector('.menu-item');
    const drop = group.querySelector('.menu-dropdown');
    if (!btn || !drop) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = drop.classList.contains('open');
      // Close all dropdowns
      document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('open'));
      document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('open'));
      if (!isOpen) {
        drop.classList.add('open');
        btn.classList.add('open');
      }
    });
  });

  // Close menus on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('open'));
  });
}

// ---- Init ----
function init() {
  initEditor();
  initMenus();

  // Activity bar
  document.querySelectorAll('.activity-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.panel;
      if (p === 'explorer') toggleSidebar();
      if (p === 'ai') toggleAI();
      if (p === 'preview') togglePreview();
      if (p === 'terminal') toggleTerminal();
    });
  });

  // Find bar
  $('find-input').addEventListener('input', doFind);
  $('find-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') e.shiftKey ? findPrev() : findNext();
    if (e.key === 'Escape') { state.findVisible = false; $('find-bar').classList.remove('visible'); }
  });
  $('btn-find-prev').addEventListener('click', findPrev);
  $('btn-find-next').addEventListener('click', findNext);
  $('btn-replace-all').addEventListener('click', doReplaceAll);
  $('btn-find-close').addEventListener('click', () => {
    state.findVisible = false;
    $('find-bar').classList.remove('visible');
  });

  // AI panel
  $('btn-save-api').addEventListener('click', saveApiKey);
  $('ai-send').addEventListener('click', sendAI);
  $('ai-panel-close').addEventListener('click', toggleAI);
  $('ai-clear').addEventListener('click', () => { state.aiMessages = []; renderAI(false); });
  $('btn-context').addEventListener('click', () => {
    state.includeContext = !state.includeContext;
    $('btn-context').classList.toggle('on', state.includeContext);
    $('btn-context').textContent = state.includeContext ? 'File context: ON' : 'Include file context';
  });
  $('ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
  });

  // Terminal input
  $('terminal-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = $('terminal-input').value;
      $('terminal-input').value = '';
      runTermCommand(val);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.termHistoryIndex < state.termHistory.length - 1) {
        state.termHistoryIndex++;
        $('terminal-input').value = state.termHistory[state.termHistoryIndex] || '';
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.termHistoryIndex > 0) {
        state.termHistoryIndex--;
        $('terminal-input').value = state.termHistory[state.termHistoryIndex] || '';
      } else {
        state.termHistoryIndex = -1;
        $('terminal-input').value = '';
      }
    }
  });

  renderTabs();
  loadSample();
  renderAI(false);
  updateStatus();
  refreshAIKeyStatus();
}

document.addEventListener('DOMContentLoaded', init);
