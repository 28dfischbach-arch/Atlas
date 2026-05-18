/* SiteBuilder — Drag-and-drop website builder */
let elements = [];
let selectedId = null;
let nextId = 1;
let currentDevice = 'desktop';
let dragType = null;

const DEFAULTS = {
  heading: { text:'Your Heading Here', level:'h2', align:'left', color:'#111113', fontSize:'32' },
  text: { text:'Add your text content here. Click to edit this paragraph.', align:'left', color:'#4b4b53', fontSize:'16' },
  button: { text:'Get Started', variant:'primary', align:'left', url:'#', size:'medium' },
  image: { src:'https://placehold.co/800x400/f5f5f7/86868b?text=Image', alt:'Image', width:'100', radius:'8' },
  hero: { title:'Welcome to Your Site', subtitle:'Add a compelling subtitle here that explains your value proposition.', bg:'#0071e3', color:'#ffffff', buttonText:'Get Started', buttonUrl:'#', align:'center' },
  cols2: { col1:'<b>Column 1</b><br>Add your content here', col2:'<b>Column 2</b><br>Add your content here', gap:'24', bg:'#ffffff' },
  cols3: { col1:'<b>Column 1</b><br>Content here', col2:'<b>Column 2</b><br>Content here', col3:'<b>Column 3</b><br>Content here', gap:'16', bg:'#ffffff' },
  card: { title:'Card Title', body:'Card description text goes here.', bg:'#ffffff', shadow:true, radius:'12', padding:'24' },
  divider: { color:'#e5e5ea', thickness:'1', margin:'24' },
  spacer: { height:'40' },
  nav: { brand:'My Site', links:'Home, About, Contact', bg:'#ffffff', color:'#111113' },
  footer: { text:'© 2025 My Site. All rights reserved.', bg:'#1d1d1f', color:'#ffffff' },
};

const TYPE_LABELS = {
  heading:'Heading', text:'Text', button:'Button', image:'Image',
  hero:'Hero Section', cols2:'2 Columns', cols3:'3 Columns', card:'Card',
  divider:'Divider', spacer:'Spacer', nav:'Nav Bar', footer:'Footer'
};

function genId() { return nextId++; }

window.addElement = function(type) {
  const el = { id: genId(), type, props: Object.assign({}, DEFAULTS[type] || {}) };
  elements.push(el);
  updateCanvas();
  selectEl(el.id);
};

window.dragStart = function(e, type) { dragType = type; e.dataTransfer.effectAllowed = 'copy'; };
window.dropOnCanvas = function(e) {
  e.preventDefault();
  if (dragType) { addElement(dragType); dragType = null; }
};

function selectEl(id) {
  selectedId = id;
  renderCanvas();
  renderProps();
}

function getEl(id) { return elements.find(e => e.id === id); }

function renderCanvas() {
  const canvas = document.getElementById('sbCanvas');
  const empty = document.getElementById('canvasEmpty');
  if (!elements.length) { canvas.innerHTML = ''; canvas.appendChild(empty); empty.style.display = ''; return; }
  empty.style.display = 'none';
  canvas.innerHTML = '';
  canvas.appendChild(empty);
  elements.forEach(el => {
    const wrapper = document.createElement('div');
    wrapper.className = 'sb-el' + (el.id === selectedId ? ' selected' : '');
    wrapper.dataset.id = el.id;
    wrapper.innerHTML = renderEl(el) + `<div class="sb-el-controls"><button class="sb-el-ctrl-btn" onclick="event.stopPropagation();moveUpById(${el.id})" title="Up">↑</button><button class="sb-el-ctrl-btn" onclick="event.stopPropagation();moveDownById(${el.id})" title="Down">↓</button><button class="sb-el-ctrl-btn" onclick="event.stopPropagation();deleteById(${el.id})" title="Delete">✕</button></div>`;
    wrapper.addEventListener('click', e => { e.stopPropagation(); selectEl(el.id); });
    canvas.appendChild(wrapper);
  });
  renderLayers();
}

function renderEl(el) {
  const p = el.props;
  switch(el.type) {
    case 'heading': return `<div style="text-align:${p.align||'left'};padding:8px 24px"><${p.level||'h2'} style="color:${p.color||'#111113'};font-size:${p.fontSize||32}px;font-weight:700;line-height:1.2;font-family:Inter,system-ui,sans-serif;">${esc(p.text)}</${p.level||'h2'}></div>`;
    case 'text': return `<div style="text-align:${p.align||'left'};padding:4px 24px 8px"><p style="color:${p.color||'#4b4b53'};font-size:${p.fontSize||16}px;line-height:1.7;font-family:Inter,system-ui,sans-serif;">${esc(p.text)}</p></div>`;
    case 'button': {
      const styles = p.variant === 'primary'
        ? 'background:#0071e3;color:#fff;border:none;'
        : p.variant === 'outline'
        ? 'background:transparent;color:#0071e3;border:2px solid #0071e3;'
        : 'background:#f5f5f7;color:#111113;border:none;';
      const pad = p.size === 'small' ? '8px 16px' : p.size === 'large' ? '16px 36px' : '11px 24px';
      const fs = p.size === 'small' ? '13' : p.size === 'large' ? '17' : '15';
      return `<div style="text-align:${p.align||'left'};padding:8px 24px"><button style="${styles}padding:${pad};border-radius:8px;font-size:${fs}px;font-weight:600;font-family:Inter,system-ui,sans-serif;cursor:pointer;">${esc(p.text)}</button></div>`;
    }
    case 'image': return `<div style="padding:8px 24px"><img src="${p.src}" alt="${esc(p.alt||'')}" style="width:${p.width||100}%;border-radius:${p.radius||8}px;display:block;" onerror="this.src='https://placehold.co/800x400/f5f5f7/86868b?text=Image'"></div>`;
    case 'hero': return `<div style="background:${p.bg||'#0071e3'};color:${p.color||'#fff'};text-align:${p.align||'center'};padding:80px 40px;font-family:Inter,system-ui,sans-serif;"><h1 style="font-size:48px;font-weight:800;line-height:1.1;margin-bottom:16px;">${esc(p.title)}</h1><p style="font-size:18px;opacity:0.85;margin-bottom:32px;max-width:600px;margin-left:auto;margin-right:auto;">${esc(p.subtitle)}</p><a href="${p.buttonUrl||'#'}" style="display:inline-block;background:#fff;color:#0071e3;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;text-decoration:none;">${esc(p.buttonText||'Get Started')}</a></div>`;
    case 'cols2': return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:${p.gap||24}px;padding:16px 24px;background:${p.bg||'#fff'};font-family:Inter,system-ui,sans-serif;"><div>${p.col1||''}</div><div>${p.col2||''}</div></div>`;
    case 'cols3': return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:${p.gap||16}px;padding:16px 24px;background:${p.bg||'#fff'};font-family:Inter,system-ui,sans-serif;"><div>${p.col1||''}</div><div>${p.col2||''}</div><div>${p.col3||''}</div></div>`;
    case 'card': return `<div style="margin:8px 24px;background:${p.bg||'#fff'};border-radius:${p.radius||12}px;padding:${p.padding||24}px;${p.shadow?'box-shadow:0 2px 16px rgba(0,0,0,0.08)':'border:1px solid #e5e5ea'};font-family:Inter,system-ui,sans-serif;"><div style="font-size:18px;font-weight:700;margin-bottom:8px;color:#111113;">${esc(p.title)}</div><div style="color:#4b4b53;line-height:1.6;">${esc(p.body)}</div></div>`;
    case 'divider': return `<div style="padding:${p.margin||24}px 24px 0"><hr style="border:none;border-top:${p.thickness||1}px solid ${p.color||'#e5e5ea'};margin:0"></div>`;
    case 'spacer': return `<div style="height:${p.height||40}px"></div>`;
    case 'nav': {
      const links = (p.links||'').split(',').map(l=>l.trim()).filter(Boolean);
      return `<nav style="background:${p.bg||'#fff'};color:${p.color||'#111113'};padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;border-bottom:1px solid #e5e5ea;font-family:Inter,system-ui,sans-serif;"><span style="font-size:18px;font-weight:700;">${esc(p.brand||'My Site')}</span><div style="display:flex;gap:24px;">${links.map(l=>`<a href="#" style="color:${p.color||'#111113'};text-decoration:none;font-size:14px;font-weight:500;">${esc(l)}</a>`).join('')}</div></nav>`;
    }
    case 'footer': return `<footer style="background:${p.bg||'#1d1d1f'};color:${p.color||'#fff'};text-align:center;padding:24px;font-size:14px;font-family:Inter,system-ui,sans-serif;">${esc(p.text)}</footer>`;
    default: return `<div style="padding:16px 24px;color:#86868b;font-style:italic;">Unknown element: ${el.type}</div>`;
  }
}

function renderProps() {
  const empty = document.getElementById('propsEmpty');
  const panel = document.getElementById('propsPanel');
  if (!selectedId) { empty.style.display = ''; panel.style.display = 'none'; return; }
  const el = getEl(selectedId);
  if (!el) { empty.style.display = ''; panel.style.display = 'none'; return; }
  empty.style.display = 'none'; panel.style.display = '';
  document.getElementById('propsTitle').textContent = TYPE_LABELS[el.type] || el.type;
  const fields = document.getElementById('propFields');
  fields.innerHTML = '';
  const p = el.props;

  const propDefs = getPropDefs(el.type, p);
  propDefs.forEach(def => {
    const div = document.createElement('div');
    div.className = 'sb-prop-field';
    let input = '';
    if (def.type === 'text') {
      input = `<input class="sb-prop-input" data-key="${def.key}" value="${esc(p[def.key]||'')}">`;
    } else if (def.type === 'textarea') {
      input = `<textarea class="sb-prop-textarea" data-key="${def.key}">${p[def.key]||''}</textarea>`;
    } else if (def.type === 'select') {
      input = `<select class="sb-prop-select" data-key="${def.key}">${def.options.map(o=>`<option value="${o.v}"${p[def.key]===o.v?' selected':''}>${o.l}</option>`).join('')}</select>`;
    } else if (def.type === 'color') {
      input = `<div class="sb-prop-color"><input type="color" value="${p[def.key]||'#111113'}" data-key="${def.key}"><input class="sb-prop-input" data-key="${def.key}" value="${p[def.key]||''}"></div>`;
    } else if (def.type === 'number') {
      input = `<input class="sb-prop-input" type="number" data-key="${def.key}" value="${p[def.key]||''}" min="${def.min||0}" max="${def.max||9999}">`;
    } else if (def.type === 'checkbox') {
      input = `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" data-key="${def.key}" ${p[def.key]?'checked':''}><span style="font-size:12px;">${def.label}</span></label>`;
    }
    div.innerHTML = `<label class="sb-prop-lbl">${def.label}</label>${input}`;
    fields.appendChild(div);
  });

  // Bind inputs
  fields.querySelectorAll('[data-key]').forEach(inp => {
    const handler = () => {
      const el2 = getEl(selectedId);
      if (!el2) return;
      if (inp.type === 'checkbox') el2.props[inp.dataset.key] = inp.checked;
      else el2.props[inp.dataset.key] = inp.value;
      renderCanvas();
    };
    inp.addEventListener('input', handler);
    inp.addEventListener('change', handler);
  });
}

function getPropDefs(type, p) {
  const ALIGNS = [{v:'left',l:'Left'},{v:'center',l:'Center'},{v:'right',l:'Right'}];
  switch(type) {
    case 'heading': return [
      {key:'text',type:'text',label:'Text'},
      {key:'level',type:'select',label:'Level',options:[{v:'h1',l:'H1'},{v:'h2',l:'H2'},{v:'h3',l:'H3'},{v:'h4',l:'H4'}]},
      {key:'fontSize',type:'number',label:'Font Size (px)',min:10,max:120},
      {key:'color',type:'color',label:'Color'},
      {key:'align',type:'select',label:'Align',options:ALIGNS},
    ];
    case 'text': return [
      {key:'text',type:'textarea',label:'Content'},
      {key:'fontSize',type:'number',label:'Font Size (px)',min:10,max:60},
      {key:'color',type:'color',label:'Color'},
      {key:'align',type:'select',label:'Align',options:ALIGNS},
    ];
    case 'button': return [
      {key:'text',type:'text',label:'Button Text'},
      {key:'variant',type:'select',label:'Style',options:[{v:'primary',l:'Primary'},{v:'outline',l:'Outline'},{v:'ghost',l:'Ghost'}]},
      {key:'size',type:'select',label:'Size',options:[{v:'small',l:'Small'},{v:'medium',l:'Medium'},{v:'large',l:'Large'}]},
      {key:'url',type:'text',label:'Link URL'},
      {key:'align',type:'select',label:'Align',options:ALIGNS},
    ];
    case 'image': return [
      {key:'src',type:'text',label:'Image URL'},
      {key:'alt',type:'text',label:'Alt Text'},
      {key:'width',type:'number',label:'Width %',min:10,max:100},
      {key:'radius',type:'number',label:'Border Radius',min:0,max:60},
    ];
    case 'hero': return [
      {key:'title',type:'text',label:'Title'},
      {key:'subtitle',type:'textarea',label:'Subtitle'},
      {key:'buttonText',type:'text',label:'Button Text'},
      {key:'buttonUrl',type:'text',label:'Button URL'},
      {key:'bg',type:'color',label:'Background'},
      {key:'color',type:'color',label:'Text Color'},
      {key:'align',type:'select',label:'Align',options:ALIGNS},
    ];
    case 'cols2': return [
      {key:'col1',type:'textarea',label:'Column 1 (HTML)'},
      {key:'col2',type:'textarea',label:'Column 2 (HTML)'},
      {key:'gap',type:'number',label:'Gap (px)',min:0,max:80},
      {key:'bg',type:'color',label:'Background'},
    ];
    case 'cols3': return [
      {key:'col1',type:'textarea',label:'Col 1 (HTML)'},
      {key:'col2',type:'textarea',label:'Col 2 (HTML)'},
      {key:'col3',type:'textarea',label:'Col 3 (HTML)'},
      {key:'gap',type:'number',label:'Gap (px)',min:0,max:80},
    ];
    case 'card': return [
      {key:'title',type:'text',label:'Title'},
      {key:'body',type:'textarea',label:'Body'},
      {key:'bg',type:'color',label:'Background'},
      {key:'shadow',type:'checkbox',label:'Show shadow'},
      {key:'radius',type:'number',label:'Border Radius',min:0,max:40},
      {key:'padding',type:'number',label:'Padding (px)',min:8,max:80},
    ];
    case 'divider': return [
      {key:'color',type:'color',label:'Color'},
      {key:'thickness',type:'number',label:'Thickness (px)',min:1,max:10},
      {key:'margin',type:'number',label:'Vertical Margin',min:0,max:80},
    ];
    case 'spacer': return [{key:'height',type:'number',label:'Height (px)',min:8,max:300}];
    case 'nav': return [
      {key:'brand',type:'text',label:'Brand Name'},
      {key:'links',type:'text',label:'Links (comma separated)'},
      {key:'bg',type:'color',label:'Background'},
      {key:'color',type:'color',label:'Text Color'},
    ];
    case 'footer': return [
      {key:'text',type:'text',label:'Footer Text'},
      {key:'bg',type:'color',label:'Background'},
      {key:'color',type:'color',label:'Text Color'},
    ];
    default: return [];
  }
}

function renderLayers() {
  const list = document.getElementById('sbLayerList');
  list.innerHTML = '';
  elements.forEach((el, i) => {
    const item = document.createElement('div');
    item.className = 'sb-layer-item' + (el.id === selectedId ? ' active' : '');
    item.innerHTML = `<span class="sl-label">${TYPE_LABELS[el.type]||el.type} ${i+1}</span>`;
    item.addEventListener('click', () => selectEl(el.id));
    list.appendChild(item);
  });
}

window.deleteSelected = function() { if (selectedId) deleteById(selectedId); };
window.deleteById = function(id) {
  elements = elements.filter(e => e.id !== id);
  if (selectedId === id) selectedId = null;
  updateCanvas();
};
window.moveUp = function() { moveUpById(selectedId); };
window.moveDown = function() { moveDownById(selectedId); };
window.moveUpById = function(id) {
  const i = elements.findIndex(e => e.id === id);
  if (i > 0) { [elements[i-1], elements[i]] = [elements[i], elements[i-1]]; updateCanvas(); }
};
window.moveDownById = function(id) {
  const i = elements.findIndex(e => e.id === id);
  if (i < elements.length - 1) { [elements[i], elements[i+1]] = [elements[i+1], elements[i]]; updateCanvas(); }
};

function updateCanvas() { renderCanvas(); renderProps(); }

window.setDevice = function(dev) {
  currentDevice = dev;
  document.querySelectorAll('.sb-device-btn').forEach(b => b.classList.toggle('active', b.dataset.device === dev));
  const wrap = document.getElementById('canvasWrap');
  wrap.className = 'sb-canvas-wrap ' + dev;
};

window.clearCanvas = function() {
  if (elements.length && !confirm('Clear all elements?')) return;
  elements = []; selectedId = null; updateCanvas();
};

window.previewSite = function() {
  const html = buildHTML();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const overlay = document.createElement('div');
  overlay.className = 'sb-preview-overlay';
  overlay.innerHTML = `
    <div class="sb-preview-bar">
      <span style="font-size:13px;font-weight:600;">Preview</span>
      <button onclick="document.body.removeChild(this.closest('.sb-preview-overlay'));URL.revokeObjectURL('${url}')" style="padding:5px 14px;border-radius:6px;border:1px solid #e5e5ea;background:#fff;font-size:12px;cursor:pointer;">Close</button>
    </div>
    <iframe class="sb-preview-frame" src="${url}"></iframe>`;
  document.body.appendChild(overlay);
};

window.exportHTML = function() {
  const html = buildHTML();
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site.html';
  a.click();
};

function buildHTML() {
  const body = elements.map(el => renderEl(el)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Site</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #fff; color: #111113; }
  a { color: inherit; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.sb-el, .sb-props, .sb-components')) {
    selectedId = null; renderCanvas(); renderProps();
  }
});

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

setDevice('desktop');
renderCanvas();
renderProps();

window.exportToShopifyEditor = window.exportShopifyTheme = function(){
  var canvas = document.getElementById('sbCanvas');
  var bodyHtml = canvas ? canvas.innerHTML : '';
  // Strip selection handles and internal attributes
  bodyHtml = bodyHtml.replace(/class="sb-el selected"/g,'class="sb-el"')
    .replace(/ data-id="[^"]*"/g,'')
    .replace(/<div class="sb-el-controls">[\s\S]*?<\/div>/g,'')
    .replace(/<div class="canvasEmpty"[^>]*>[\s\S]*?<\/div>/g,'');

  // Read SiteBuilder settings for theme name
  var sbSettings = null;
  try{ sbSettings = JSON.parse(localStorage.getItem('atlas_sitebuilder_settings')||'null'); }catch(e){}
  var themeName = (sbSettings && sbSettings.themeName) || 'Atlas Theme';
  var exportFormat = (sbSettings && sbSettings.exportFormat) || 'shopify';

  if (exportFormat === 'html') {
    // Plain HTML download
    var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>'+themeName+'</title>\n<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,\'Inter\',sans-serif;}.sb-el{position:relative;}</style>\n</head>\n<body>\n'+bodyHtml+'\n</body>\n</html>';
    var blob = new Blob([html], {type:'text/html'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download=themeName.replace(/\s+/g,'-').toLowerCase()+'.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    return;
  }

  var SHOPIFY_FILES = {
    'layout/theme.liquid': '<!DOCTYPE html>\n<html lang="{{ shop.locale }}">\n<head>\n  <meta charset="UTF-8">\n  <title>{{ page_title }} - {{ shop.name }}</title>\n  {{ content_for_header }}\n  {{ \'theme.css\' | asset_url | stylesheet_tag }}\n</head>\n<body>\n  {{ content_for_layout }}\n  {{ \'theme.js\' | asset_url | script_tag }}\n</body>\n</html>',
    'templates/index.liquid': "{% section 'main-index' %}",
    'templates/product.liquid': "{% section 'main-product' %}",
    'templates/collection.liquid': "{% section 'main-collection' %}",
    'sections/main-index.liquid': '<div class="atlas-section">\n' + (bodyHtml||'<!-- Your content here -->') + '\n</div>\n{% schema %}\n{\n  "name": "Main Index",\n  "settings": []\n}\n{% endschema %}',
    'sections/main-product.liquid': '<div class="atlas-product">\n  <h1>{{ product.title }}</h1>\n  <p>{{ product.description }}</p>\n  <form method="post" action="/cart/add">\n    <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">\n    <button type="submit">Add to Cart</button>\n  </form>\n</div>\n{% schema %}{"name":"Product","settings":[]}{% endschema %}',
    'sections/main-collection.liquid': '{% for product in collection.products %}\n<div class="product-card">\n  <a href="{{ product.url }}"><img src="{{ product.featured_image | img_url: \'400x\' }}" alt="{{ product.title }}"></a>\n  <h3>{{ product.title }}</h3>\n  <p>{{ product.price | money }}</p>\n</div>\n{% endfor %}\n{% schema %}{"name":"Collection","settings":[]}{% endschema %}',
    'snippets/product-card.liquid': '<div class="product-card">\n  <a href="{{ product.url }}">{{ product.title }}</a>\n  <span>{{ product.price | money }}</span>\n</div>',
    'assets/theme.css': '/* Atlas SiteBuilder Theme */\nbody{margin:0;font-family:-apple-system,BlinkMacSystemFont,\'Inter\',sans-serif;}\n.atlas-section{max-width:1200px;margin:0 auto;padding:40px 20px;}\n.product-card{border:1px solid #e5e5ea;border-radius:8px;padding:16px;margin:8px;}',
    'assets/theme.js': '/* Atlas SiteBuilder Theme JS */\ndocument.addEventListener(\'DOMContentLoaded\',function(){console.log(\'Atlas theme loaded\');});',
    'config/settings_schema.json': '[{"name":"theme_info","theme_name":"Atlas Theme","theme_version":"1.0.0","theme_author":"Atlas SiteBuilder"}]',
    'config/settings_data.json': '{"current":{}}',
    'locales/en.default.json': '{"general":{"pagination":{"previous":"Previous","next":"Next"}}}'
  };

  try {
    var existing = JSON.parse(localStorage.getItem('nc_files')||'[]');
    var ts = Date.now();
    Object.keys(SHOPIFY_FILES).forEach(function(path){
      var parts = path.split('/');
      var name = parts[parts.length-1];
      var folder = parts[0];
      var ext = name.split('.').pop();
      var langMap = {liquid:'html',css:'css',js:'javascript',json:'json'};
      var id = 'shopify-'+ts+'-'+name;
      var fileObj = {id:id, name:name, folder:folder, lang:langMap[ext]||'text', content:SHOPIFY_FILES[path]};
      var idx = existing.findIndex(function(f){return f.name===name && f.folder===folder;});
      if(idx>=0) existing[idx]=fileObj; else existing.push(fileObj);
    });
    localStorage.setItem('nc_files', JSON.stringify(existing));
    localStorage.setItem('atlas_editor_goto', 'shopify');
    // Open editor immediately via parent
    try{ parent.postMessage({type:'atlas-open', app:'editor'}, '*'); }catch(e){}
  } catch(err) {
    alert('Export failed: '+err.message);
  }
};
