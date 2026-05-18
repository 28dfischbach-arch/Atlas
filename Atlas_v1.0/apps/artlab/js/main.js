/* ArtLab — Canvas Image Editor */
const canvas = document.getElementById('alCanvas');
const ctx = canvas.getContext('2d');

// State
let tool = 'brush';
let color = '#111113';
let brushSize = 8;
let opacity = 1;
let isDrawing = false;
let lastX = 0, lastY = 0;
let startX = 0, startY = 0;
let layers = [];
let activeLayerIdx = 0;
let historyStack = [];
let historyPos = -1;
let textInputActive = false;
let textX = 0, textY = 0;

// Layer management
function createLayer(name) {
  const lc = document.createElement('canvas');
  lc.width = canvas.width;
  lc.height = canvas.height;
  return { name: name || 'Layer', canvas: lc, visible: true };
}

function init() {
  layers = [createLayer('Background')];
  const bg = layers[0].canvas.getContext('2d');
  bg.fillStyle = '#ffffff';
  bg.fillRect(0, 0, canvas.width, canvas.height);
  activeLayerIdx = 0;
  renderLayers();
  compose();
  pushHistory();
  updateInfo();
}

function compose() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  layers.forEach(l => {
    if (l.visible) ctx.drawImage(l.canvas, 0, 0);
  });
}

function getActiveCtx() {
  return layers[activeLayerIdx] ? layers[activeLayerIdx].canvas.getContext('2d') : ctx;
}

// History
function pushHistory() {
  const snap = layers.map(l => {
    const c2 = document.createElement('canvas');
    c2.width = l.canvas.width; c2.height = l.canvas.height;
    c2.getContext('2d').drawImage(l.canvas, 0, 0);
    return { name: l.name, visible: l.visible, canvas: c2 };
  });
  historyStack = historyStack.slice(0, historyPos + 1);
  historyStack.push({ layers: snap, activeLayerIdx });
  if (historyStack.length > 40) historyStack.shift();
  historyPos = historyStack.length - 1;
}

window.history_undo = function() {
  if (historyPos <= 0) return;
  historyPos--;
  restoreHistory(historyStack[historyPos]);
};
window.history_redo = function() {
  if (historyPos >= historyStack.length - 1) return;
  historyPos++;
  restoreHistory(historyStack[historyPos]);
};

function restoreHistory(snap) {
  layers = snap.layers.map(l => {
    const c2 = document.createElement('canvas');
    c2.width = l.canvas.width; c2.height = l.canvas.height;
    c2.getContext('2d').drawImage(l.canvas, 0, 0);
    return { name: l.name, visible: l.visible, canvas: c2 };
  });
  activeLayerIdx = snap.activeLayerIdx;
  compose(); renderLayers();
}

// Tools
window.setTool = function(t) {
  tool = t;
  document.querySelectorAll('.al-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  canvas.style.cursor = t === 'text' ? 'text' : t === 'select' ? 'default' : t === 'eyedrop' ? 'crosshair' : 'crosshair';
};

window.setColor = function(c) {
  color = c;
  document.getElementById('colorPreview').style.background = c;
  document.getElementById('colorPicker').value = c.length === 7 ? c : '#111113';
};

window.setBrushSize = function(v) {
  brushSize = parseInt(v);
  document.getElementById('sizeVal').textContent = v;
};

window.setOpacity = function(v) {
  opacity = parseInt(v) / 100;
  document.getElementById('opacityVal').textContent = v;
};

// Canvas events
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

canvas.addEventListener('mousedown', e => { e.preventDefault(); onDown(e); });
canvas.addEventListener('mousemove', e => { e.preventDefault(); onMove(e); });
canvas.addEventListener('mouseup', e => { e.preventDefault(); onUp(e); });
canvas.addEventListener('mouseleave', e => { if (isDrawing) onUp(e); });

canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(e); }, { passive: false });

function onDown(e) {
  const pos = getPos(e);
  if (tool === 'text') {
    showTextInput(pos.x, pos.y); return;
  }
  if (tool === 'eyedrop') {
    pickColor(pos.x, pos.y); return;
  }
  if (tool === 'fill') {
    floodFill(Math.round(pos.x), Math.round(pos.y)); pushHistory(); return;
  }
  isDrawing = true;
  lastX = pos.x; lastY = pos.y;
  startX = pos.x; startY = pos.y;
  if (tool === 'brush' || tool === 'eraser') {
    const ac = getActiveCtx();
    ac.globalAlpha = opacity;
    ac.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ac.strokeStyle = color;
    ac.lineWidth = brushSize;
    ac.lineCap = 'round';
    ac.lineJoin = 'round';
    ac.beginPath();
    ac.moveTo(pos.x, pos.y);
    // Draw a dot on single click
    ac.lineTo(pos.x + 0.1, pos.y);
    ac.stroke();
    compose();
  }
}

function onMove(e) {
  if (!isDrawing) return;
  const pos = getPos(e);
  const ac = getActiveCtx();
  if (tool === 'brush' || tool === 'eraser') {
    ac.globalAlpha = opacity;
    ac.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ac.strokeStyle = color;
    ac.lineWidth = brushSize;
    ac.lineCap = 'round';
    ac.lineJoin = 'round';
    ac.beginPath();
    ac.moveTo(lastX, lastY);
    ac.lineTo(pos.x, pos.y);
    ac.stroke();
    compose();
  } else if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
    compose(); // redraw without preview first
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    const w = pos.x - startX, h = pos.y - startY;
    if (tool === 'rect') {
      ctx.strokeRect(startX, startY, w, h);
    } else if (tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(startX + w/2, startY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
      ctx.stroke();
    } else if (tool === 'line') {
      ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    }
    ctx.restore();
  }
  lastX = pos.x; lastY = pos.y;
}

function onUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getPos(e);
  const ac = getActiveCtx();
  if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
    const w = pos.x - startX, h = pos.y - startY;
    ac.save();
    ac.globalAlpha = opacity;
    ac.globalCompositeOperation = 'source-over';
    ac.strokeStyle = color; ac.fillStyle = color;
    ac.lineWidth = brushSize; ac.lineCap = 'round';
    if (tool === 'rect') {
      ac.strokeRect(startX, startY, w, h);
    } else if (tool === 'ellipse') {
      ac.beginPath();
      ac.ellipse(startX + w/2, startY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
      ac.stroke();
    } else if (tool === 'line') {
      ac.beginPath(); ac.moveTo(startX, startY); ac.lineTo(pos.x, pos.y); ac.stroke();
    }
    ac.restore();
    compose();
  }
  pushHistory();
}

// Fill
function floodFill(px, py) {
  const ac = getActiveCtx();
  const imgData = ac.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const idx = (py * canvas.width + px) * 4;
  const tr = data[idx], tg = data[idx+1], tb = data[idx+2], ta = data[idx+3];
  const fc = hexToRGB(color);
  if (!fc) return;
  if (tr === fc[0] && tg === fc[1] && tb === fc[2]) return;
  const stack = [[px, py]];
  const visited = new Uint8Array(canvas.width * canvas.height);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
    const i = (y * canvas.width + x) * 4;
    if (visited[y * canvas.width + x]) continue;
    if (data[i] !== tr || data[i+1] !== tg || data[i+2] !== tb || data[i+3] !== ta) continue;
    visited[y * canvas.width + x] = 1;
    data[i] = fc[0]; data[i+1] = fc[1]; data[i+2] = fc[2]; data[i+3] = Math.round(opacity * 255);
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  ac.putImageData(imgData, 0, 0);
  compose();
}

function hexToRGB(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : null;
}

// Eyedropper
function pickColor(x, y) {
  const imgData = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  const hex = '#' + [imgData[0], imgData[1], imgData[2]].map(v => v.toString(16).padStart(2,'0')).join('');
  setColor(hex);
  setTool('brush');
}

// Text input
function showTextInput(x, y) {
  textX = x; textY = y;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  const wrap = document.getElementById('canvasWrap');
  const wrapRect = wrap.getBoundingClientRect();
  const ti = document.getElementById('alTextInput');
  ti.style.display = '';
  ti.style.left = (rect.left - wrapRect.left + x * scaleX) + 'px';
  ti.style.top = (rect.top - wrapRect.top + y * scaleY) + 'px';
  ti.style.fontSize = Math.max(12, brushSize * scaleX) + 'px';
  ti.style.color = color;
  ti.value = '';
  ti.focus();
  textInputActive = true;
}

window.commitText = function() {
  if (!textInputActive) return;
  const ti = document.getElementById('alTextInput');
  const text = ti.value.trim();
  if (text) {
    const ac = getActiveCtx();
    ac.save();
    ac.globalAlpha = opacity;
    ac.fillStyle = color;
    ac.font = brushSize + 'px Inter, sans-serif';
    ac.fillText(text, textX, textY);
    ac.restore();
    compose(); pushHistory();
  }
  ti.style.display = 'none';
  textInputActive = false;
};

// Layers
window.addLayer = function() {
  layers.splice(activeLayerIdx, 0, createLayer('Layer ' + (layers.length + 1)));
  renderLayers(); compose(); pushHistory();
};
window.deleteLayer = function() {
  if (layers.length <= 1) { alert('Cannot delete the only layer.'); return; }
  layers.splice(activeLayerIdx, 1);
  activeLayerIdx = Math.min(activeLayerIdx, layers.length - 1);
  renderLayers(); compose(); pushHistory();
};
window.mergeDown = function() {
  if (activeLayerIdx >= layers.length - 1) return;
  const above = layers[activeLayerIdx];
  const below = layers[activeLayerIdx + 1];
  below.canvas.getContext('2d').drawImage(above.canvas, 0, 0);
  layers.splice(activeLayerIdx, 1);
  activeLayerIdx = Math.max(0, activeLayerIdx - 1);
  renderLayers(); compose(); pushHistory();
};

function renderLayers() {
  const list = document.getElementById('layerList');
  list.innerHTML = '';
  layers.forEach((l, i) => {
    const row = document.createElement('button');
    row.className = 'al-layer-row' + (i === activeLayerIdx ? ' active' : '');
    row.innerHTML = `
      <svg class="al-layer-vis" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" onclick="event.stopPropagation();toggleVis(${i})">${l.visible ? '<path d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>' : '<path d="M2 2l12 12M6 4.5A6 6 0 0114 8s-.9 1.6-2.5 2.8M10 11.5A6 6 0 012 8s.9-1.6 2.5-2.8"/>'}</svg>
      <span class="al-layer-name">${l.name}</span>`;
    row.addEventListener('click', () => { activeLayerIdx = i; renderLayers(); });
    list.appendChild(row);
  });
}

window.toggleVis = function(i) {
  layers[i].visible = !layers[i].visible;
  renderLayers(); compose();
};

// Canvas resize
window.resizeCanvas = function() {
  const w = parseInt(document.getElementById('cwWidth').value) || 800;
  const h = parseInt(document.getElementById('cwHeight').value) || 600;
  if (w < 1 || h < 1 || w > 4000 || h > 4000) return;
  layers.forEach(l => {
    const nc = document.createElement('canvas');
    nc.width = w; nc.height = h;
    nc.getContext('2d').drawImage(l.canvas, 0, 0);
    l.canvas = nc;
  });
  canvas.width = w; canvas.height = h;
  compose(); pushHistory(); updateInfo();
};

window.setPreset = function(w, h) {
  document.getElementById('cwWidth').value = w;
  document.getElementById('cwHeight').value = h;
  resizeCanvas();
};

function updateInfo() {
  document.getElementById('canvasInfo').textContent = canvas.width + ' × ' + canvas.height;
}

// New / open / export
window.newCanvas = function() {
  if (!confirm('Start a new canvas? Current work will be lost.')) return;
  const w = canvas.width, h = canvas.height;
  layers = [createLayer('Background')];
  layers[0].canvas.getContext('2d').fillStyle = '#ffffff';
  layers[0].canvas.getContext('2d').fillRect(0, 0, w, h);
  activeLayerIdx = 0;
  renderLayers(); compose(); pushHistory();
};

window.importImage = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width; canvas.height = img.height;
    document.getElementById('cwWidth').value = img.width;
    document.getElementById('cwHeight').value = img.height;
    layers.forEach(l => { l.canvas.width = img.width; l.canvas.height = img.height; });
    layers[0].canvas.getContext('2d').drawImage(img, 0, 0);
    compose(); renderLayers(); pushHistory(); updateInfo();
  };
  img.src = URL.createObjectURL(file);
  e.target.value = '';
};

window.downloadCanvas = function() {
  const link = document.createElement('a');
  link.download = 'artlab-canvas.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) history_redo(); else history_undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); history_redo(); return; }
  const toolKeys = { v:'select', b:'brush', e:'eraser', g:'fill', r:'rect', o:'ellipse', l:'line', t:'text', i:'eyedrop' };
  if (toolKeys[e.key]) setTool(toolKeys[e.key]);
});

init();
