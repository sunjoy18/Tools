/* ==================================================================
   core.js — shared utilities used across all tool modules
   ================================================================== */
"use strict";

function formatBytes(bytes){
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(2) + ' MB';
  return (bytes/(1024*1024*1024)).toFixed(2) + ' GB';
}

function byteLength(str){
  let bytes = 0;
  for (let i=0;i<str.length;i++){
    const code = str.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function safeParse(text){
  try{ return { ok:true, value: JSON.parse(text) }; }
  catch(e){ return { ok:false, error: e.message }; }
}

function typeOf(v){
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function computeStats(root){
  let keys = 0, maxDepth = 0, arrays = 0, arrayItems = 0;
  const stack = [{ v: root, d: 1 }];
  while (stack.length){
    const { v, d } = stack.pop();
    if (d > maxDepth) maxDepth = d;
    const t = typeOf(v);
    if (t === 'object'){
      const ks = Object.keys(v);
      keys += ks.length;
      for (const k of ks) stack.push({ v: v[k], d: d+1 });
    } else if (t === 'array'){
      arrays += 1;
      arrayItems += v.length;
      for (let i=0;i<v.length;i++) stack.push({ v: v[i], d: d+1 });
    }
  }
  return { keys, maxDepth, arrays, arrayItems };
}

function downloadText(filename, text, mime){
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

function downloadDataUrl(filename, dataUrl){
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function flashButton(idOrEl, msg){
  const btn = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(()=>btn.textContent = original, 1200);
}

async function copyToClipboard(text, btnId){
  try{
    await navigator.clipboard.writeText(text);
    if (btnId) flashButton(btnId, 'Copied!');
    return true;
  } catch(e){
    if (btnId) flashButton(btnId, 'Copy failed');
    return false;
  }
}

/* ============================================================
   Compact file upload — small header button + hint that hides
   once the box has content; drag-and-drop works on the whole card.
   ============================================================ */
function wireCompactUpload(opts){
  const { cardEl, fileInputEl, uploadBtnEl, dropHintEl, dropHintBtnEl, textareaEl, onText } = opts;
  function openPicker(){ fileInputEl.click(); }
  if (uploadBtnEl) uploadBtnEl.addEventListener('click', openPicker);
  if (dropHintBtnEl) dropHintBtnEl.addEventListener('click', openPicker);
  fileInputEl.addEventListener('change', () => {
    const f = fileInputEl.files[0];
    if (f) readFile(f);
    fileInputEl.value = '';
  });
  if (cardEl){
    ['dragenter','dragover'].forEach(evt => cardEl.addEventListener(evt, e => {
      e.preventDefault(); cardEl.classList.add('drag-over');
    }));
    ['dragleave','drop'].forEach(evt => cardEl.addEventListener(evt, e => {
      e.preventDefault(); cardEl.classList.remove('drag-over');
    }));
    cardEl.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f) readFile(f);
    });
  }
  function readFile(f){
    const reader = new FileReader();
    reader.onload = () => { onText(reader.result, f.name, f); updateHint(); };
    reader.readAsText(f);
  }
  function updateHint(){
    if (dropHintEl && textareaEl) dropHintEl.style.display = textareaEl.value.trim() ? 'none' : 'flex';
  }
  if (textareaEl) textareaEl.addEventListener('input', updateHint);
  updateHint();
  return { updateHint };
}

/* ============================================================
   Error box with Auto-repair + Show-me actions (JSON-aware)
   ============================================================ */
function locateErrorPosition(text, message){
  let m = message.match(/line (\d+) column (\d+)/i);
  if (m) return { line: +m[1], col: +m[2] };
  m = message.match(/position (\d+)/i);
  if (m){
    const pos = +m[1];
    let line = 1, col = 1;
    for (let k=0; k<pos && k<text.length; k++){ if (text[k]==='\n'){ line++; col=1; } else col++; }
    return { line, col };
  }
  return null;
}
function lineColToIndex(text, line, col){
  const lines = text.split('\n');
  let idx = 0;
  for (let l=0; l<line-1 && l<lines.length; l++) idx += lines[l].length + 1;
  return Math.min(idx + Math.max(0, col-1), text.length);
}
function scrollTextareaToLine(textareaEl, line){
  const cs = getComputedStyle(textareaEl);
  let lh = parseFloat(cs.lineHeight);
  if (!lh || isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.6;
  textareaEl.scrollTop = Math.max(0, (line-1)*lh - textareaEl.clientHeight/2);
}

function wireErrorBox(opts){
  const { errorBoxEl, repairNoteEl, textareaEl, onAfterRepair } = opts;

  function clear(){
    errorBoxEl.classList.remove('show'); errorBoxEl.innerHTML = '';
    if (repairNoteEl){ repairNoteEl.classList.remove('show'); repairNoteEl.innerHTML = ''; }
  }

  function showPlain(message){
    if (repairNoteEl){ repairNoteEl.classList.remove('show'); repairNoteEl.innerHTML = ''; }
    errorBoxEl.innerHTML = '<div class="err-msg"><span class="warn-ico">\u26A0\uFE0F</span><span>' + escapeHtml(message) + '</span></div>';
    errorBoxEl.classList.add('show');
  }

  function showError(message){
    if (repairNoteEl){ repairNoteEl.classList.remove('show'); repairNoteEl.innerHTML = ''; }
    errorBoxEl.innerHTML = '';
    const msgRow = document.createElement('div');
    msgRow.className = 'err-msg';
    const icon = document.createElement('span'); icon.className='warn-ico'; icon.textContent='\u26A0\uFE0F';
    const msgText = document.createElement('span'); msgText.textContent = message;
    msgRow.appendChild(icon); msgRow.appendChild(msgText);
    errorBoxEl.appendChild(msgRow);

    const actions = document.createElement('div');
    actions.className = 'err-actions';
    const repairBtn = document.createElement('button');
    repairBtn.className = 'btn repair'; repairBtn.type = 'button'; repairBtn.textContent = '\uD83D\uDD27 Auto repair';
    const showBtn = document.createElement('button');
    showBtn.className = 'btn subtle'; showBtn.type = 'button'; showBtn.textContent = '\uD83D\uDC41 Show me';
    actions.appendChild(repairBtn); actions.appendChild(showBtn);
    errorBoxEl.appendChild(actions);
    errorBoxEl.classList.add('show');

    showBtn.addEventListener('click', () => {
      const loc = locateErrorPosition(textareaEl.value, message);
      if (!loc) return;
      const idx = lineColToIndex(textareaEl.value, loc.line, loc.col);
      textareaEl.focus();
      textareaEl.setSelectionRange(Math.max(0, idx-1), Math.min(textareaEl.value.length, idx+1));
      scrollTextareaToLine(textareaEl, loc.line);
    });

    repairBtn.addEventListener('click', () => {
      try{
        const { text: repaired, notes } = repairJson(textareaEl.value);
        const parsedCheck = JSON.parse(repaired);
        textareaEl.value = JSON.stringify(parsedCheck, null, 2);
        textareaEl.dispatchEvent(new Event('input'));
        if (onAfterRepair) onAfterRepair();
        errorBoxEl.classList.remove('show'); errorBoxEl.innerHTML = '';
        if (repairNoteEl){
          const shown = notes.slice(0, 6);
          const extra = notes.length > shown.length ? ('; and ' + (notes.length - shown.length) + ' more fix(es)') : '';
          repairNoteEl.textContent = '\u2713 Repaired' + (notes.length ? (' \u2014 ' + shown.join('; ') + extra) : '') + '.';
          repairNoteEl.classList.add('show');
        }
      } catch(e){
        msgText.textContent = "Couldn't fully auto-repair this JSON: " + e.message;
      }
    });
  }

  return { showError, showPlain, clear };
}

/* ============================================================
   Tolerant JSON repair parser
   ============================================================ */
function repairJson(input){
  let i = 0;
  const len = input.length;
  const notes = [];

  function isWs(c){ return c===' '||c==='\t'||c==='\n'||c==='\r'; }

  function skipWsAndComments(){
    while (i < len){
      const c = input[i];
      if (isWs(c)){ i++; continue; }
      if (c==='/' && input[i+1]==='/'){ notes.push('stripped a // comment'); while (i<len && input[i]!=='\n') i++; continue; }
      if (c==='/' && input[i+1]==='*'){ notes.push('stripped a /* */ comment'); i+=2; while (i<len && !(input[i]==='*'&&input[i+1]==='/')) i++; i+=2; continue; }
      break;
    }
  }

  function parseValue(){
    skipWsAndComments();
    if (i >= len) throw new Error('Unexpected end of input at position ' + i);
    const c = input[i];
    if (c === '"' || c === "'") return parseString(c);
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    return parseBareWord();
  }

  function parseString(quote){
    i++;
    let out = '"';
    while (i < len){
      const c = input[i];
      if (c === '\\'){
        const next = input[i+1];
        if (next === quote && quote === "'"){ out += "'"; i += 2; continue; }
        out += c + (next===undefined?'':next); i += 2; continue;
      }
      if (c === quote){ i++; return { text: out + '"' }; }
      if (c === '\n'){ notes.push('closed an unterminated string before a newline'); i++; return { text: out + '"' }; }
      if (c === '"' && quote === "'"){ out += '\\"'; i++; continue; }
      out += c; i++;
    }
    notes.push('closed an unterminated string at end of input');
    return { text: out + '"' };
  }

  function parseNumber(){
    const start = i;
    if (input[i] === '-') i++;
    while (i<len && input[i]>='0' && input[i]<='9') i++;
    if (input[i] === '.'){ i++; while (i<len && input[i]>='0' && input[i]<='9') i++; }
    if (input[i] === 'e' || input[i] === 'E'){ i++; if (input[i]==='+'||input[i]==='-') i++; while (i<len && input[i]>='0' && input[i]<='9') i++; }
    return { text: input.slice(start, i) };
  }

  const KEYWORD_MAP = { true:'true', false:'false', null:'null', True:'true', False:'false', None:'null',
    TRUE:'true', FALSE:'false', NULL:'null', undefined:'null', nan:'null', NaN:'null', Infinity:'null', infinity:'null' };

  function parseBareWord(){
    const start = i;
    while (i<len && !isWs(input[i]) && ',}]:('.indexOf(input[i]) === -1) i++;
    let word = input.slice(start, i);
    if (word === ''){
      notes.push('skipped an unexpected character "' + input[start] + '"');
      i = start + 1;
      return { text: 'null' };
    }
    skipWsAndComments();
    if (input[i] === '('){
      notes.push('unwrapped ' + word + '(...) to its inner value');
      const parenStart = i;
      let depth = 0;
      do { if (input[i]==='(') depth++; else if (input[i]===')') depth--; i++; } while (i<len && depth>0);
      const inner = input.slice(parenStart+1, i-1).trim();
      const strMatch = inner.match(/^['"]([\s\S]*)['"]$/);
      if (strMatch) return { text: JSON.stringify(strMatch[1]) };
      if (/^-?\d+(\.\d+)?$/.test(inner)) return { text: inner };
      return { text: JSON.stringify(inner) };
    }
    if (Object.prototype.hasOwnProperty.call(KEYWORD_MAP, word)) return { text: KEYWORD_MAP[word] };
    notes.push('quoted bare word "' + word + '" as a string');
    return { text: JSON.stringify(word) };
  }

  function parseKey(){
    skipWsAndComments();
    if (input[i] === '"' || input[i] === "'") return parseString(input[i]).text;
    const start = i;
    while (i<len && !isWs(input[i]) && ':,}]'.indexOf(input[i]) === -1) i++;
    const word = input.slice(start, i);
    if (word === '') throw new Error('Expected a property key at position ' + i);
    notes.push('quoted bare key "' + word + '"');
    return JSON.stringify(word);
  }

  function parseObject(){
    i++;
    let out = '{';
    let first = true;
    skipWsAndComments();
    while (i < len && input[i] !== '}'){
      if (!first){
        skipWsAndComments();
        if (input[i] === ','){
          i++; skipWsAndComments();
          if (input[i] === '}') { notes.push('removed a trailing comma'); break; }
          out += ',';
        } else { notes.push('inserted a missing comma'); out += ','; }
      }
      const key = parseKey();
      skipWsAndComments();
      if (input[i] === ':'){ i++; } else { notes.push('inserted a missing colon'); }
      const val = parseValue();
      out += key + ':' + val.text;
      first = false;
      skipWsAndComments();
    }
    if (input[i] === '}') i++; else notes.push('closed an unterminated object');
    return { text: out + '}' };
  }

  function parseArray(){
    i++;
    let out = '[';
    let first = true;
    skipWsAndComments();
    while (i < len && input[i] !== ']'){
      if (!first){
        skipWsAndComments();
        if (input[i] === ','){
          i++; skipWsAndComments();
          if (input[i] === ']') { notes.push('removed a trailing comma'); break; }
          out += ',';
        } else { notes.push('inserted a missing comma'); out += ','; }
      }
      const val = parseValue();
      out += val.text;
      first = false;
      skipWsAndComments();
    }
    if (input[i] === ']') i++; else notes.push('closed an unterminated array');
    return { text: out + ']' };
  }

  const values = [];
  skipWsAndComments();
  while (i < len){
    values.push(parseValue());
    skipWsAndComments();
    if (input[i] === ','){ i++; skipWsAndComments(); }
  }
  if (values.length === 0) throw new Error('No JSON value found');
  let resultText;
  if (values.length === 1){
    resultText = values[0].text;
  } else {
    notes.push('wrapped ' + values.length + ' top-level values into an array (looked like NDJSON)');
    resultText = '[' + values.map(v=>v.text).join(',') + ']';
  }
  return { text: resultText, notes };
}

/* ============================================================
   Sidebar navigation
   ============================================================ */
function initNav(){
  const navItems = document.querySelectorAll('.nav-item[data-panel]');
  const panels = document.querySelectorAll('.tool-panel');
  const topTitle = document.getElementById('topbar-title');
  const topDesc = document.getElementById('topbar-desc');

  function activate(panelId, pushHash){
    navItems.forEach(n => n.classList.toggle('active', n.dataset.panel === panelId));
    panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + panelId));
    const activeNav = document.querySelector('.nav-item[data-panel="' + panelId + '"]');
    if (activeNav){
      if (topTitle) topTitle.textContent = activeNav.dataset.title || activeNav.textContent.trim();
      if (topDesc) topDesc.textContent = activeNav.dataset.desc || '';
    }
    if (pushHash !== false) history.replaceState(null, '', '#' + panelId);
    const navWrap = document.getElementById('nav-collapsible');
    if (navWrap) navWrap.classList.remove('open');
    window.scrollTo(0,0);
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => activate(item.dataset.panel));
  });

  const toggle = document.getElementById('sidebar-toggle');
  if (toggle){
    toggle.addEventListener('click', () => {
      const navWrap = document.getElementById('nav-collapsible');
      if (navWrap) navWrap.classList.toggle('open');
    });
  }

  const initial = (location.hash || '').replace('#','');
  const validIds = Array.from(navItems).map(n => n.dataset.panel);
  activate(validIds.includes(initial) ? initial : validIds[0], false);
}

document.addEventListener('DOMContentLoaded', initNav);
