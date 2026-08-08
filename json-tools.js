/* ==================================================================
   json-tools.js — Format & Validate, Compare, Export, Schema
   Depends on: core.js (typeOf, safeParse, computeStats, escapeHtml,
   wireCompactUpload, wireErrorBox, repairJson, downloadText, etc.)
   ================================================================== */
"use strict";

const JSON_SAMPLE = {
  fleetId: "FL-2026-041",
  operator: "Aequitous Transit",
  region: "Maharashtra",
  active: true,
  driver: { id: "D-1029", name: "Ramesh Kulkarni", rating: 4.7, licenseExpiry: "2027-03-11" },
  vehicles: [
    { regNo: "MH-12-AB-1234", type: "bus", capacity: 42, lastServiceKm: 118240 },
    { regNo: "MH-12-CD-5678", type: "truck", capacity: 12000, lastServiceKm: 92310 }
  ],
  routes: ["Pune-Mumbai", "Pune-Nashik"],
  telemetry: null
};
const JSON_SAMPLE_RIGHT = {
  fleetId: "FL-2026-041",
  operator: "Aequitous Transit Pvt Ltd",
  region: "Maharashtra",
  active: true,
  driver: { id: "D-1029", name: "Ramesh Kulkarni", rating: 4.9, licenseExpiry: "2027-03-11" },
  vehicles: [
    { regNo: "MH-12-AB-1234", type: "bus", capacity: 44, lastServiceKm: 121500 },
    { regNo: "MH-12-EF-9012", type: "truck", capacity: 12000, lastServiceKm: 1200 }
  ],
  routes: ["Pune-Mumbai", "Pune-Nashik", "Pune-Kolhapur"],
  telemetry: { gpsEnabled: true }
};

/* ---------------- JSON Schema inference ---------------- */
function primitiveSchemaType(v){
  const t = typeOf(v);
  if (t === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return t;
}
function schemaKey(s){ return JSON.stringify(s, Object.keys(s).sort()); }
function mergeSchemaTwo(a, b){
  if (!a) return b;
  if (!b) return a;
  const isEmptySchema = s => s && Object.keys(s).length === 0;
  if (isEmptySchema(a)) return b;
  if (isEmptySchema(b)) return a;
  function branches(s){ return s.anyOf ? s.anyOf.slice() : [s]; }
  const all = branches(a).concat(branches(b));
  const byType = new Map();
  for (const s of all){ const t = s.type; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(s); }
  const merged = [];
  for (const [t, list] of byType.entries()){
    if (t === 'object'){
      let acc = list[0];
      for (let i=1;i<list.length;i++) acc = mergeObjectSchemas(acc, list[i]);
      merged.push(acc);
    } else if (t === 'array'){
      let itemsAcc = list[0].items;
      for (let i=1;i<list.length;i++) itemsAcc = mergeSchemaTwo(itemsAcc, list[i].items);
      merged.push({ type:'array', items: itemsAcc });
    } else {
      merged.push({ type: t });
    }
  }
  const types = merged.map(m=>m.type);
  let finalList = merged;
  if (types.includes('integer') && types.includes('number')) finalList = merged.filter(m => m.type !== 'integer');
  if (finalList.length === 1) return finalList[0];
  const seen = new Set(); const deduped = [];
  for (const s of finalList){ const k = schemaKey(s); if (!seen.has(k)){ seen.add(k); deduped.push(s); } }
  if (deduped.length === 1) return deduped[0];
  return { anyOf: deduped };
}
function mergeObjectSchemas(a, b){
  const props = {};
  const keysA = Object.keys(a.properties||{});
  const keysB = Object.keys(b.properties||{});
  const allKeys = Array.from(new Set(keysA.concat(keysB)));
  for (const k of allKeys) props[k] = mergeSchemaTwo((a.properties||{})[k], (b.properties||{})[k]);
  const reqA = new Set(a.required||[]); const reqB = new Set(b.required||[]);
  const required = allKeys.filter(k => reqA.has(k) && reqB.has(k));
  return { type:'object', properties: props, required };
}
function inferSchema(value){
  const t = typeOf(value);
  if (t === 'object'){
    const keys = Object.keys(value);
    const properties = {};
    keys.forEach(k => properties[k] = inferSchema(value[k]));
    return { type:'object', properties, required: keys };
  }
  if (t === 'array'){
    if (value.length === 0) return { type:'array', items: {} };
    let acc = inferSchema(value[0]);
    for (let i=1;i<value.length;i++) acc = mergeSchemaTwo(acc, inferSchema(value[i]));
    return { type:'array', items: acc };
  }
  return { type: primitiveSchemaType(value) };
}
function buildJsonSchema(value, title){
  const schema = inferSchema(value);
  return Object.assign({ '$schema': 'http://json-schema.org/draft-07/schema#', title: title || 'Generated schema' }, schema);
}

/* ---------------- JSON -> YAML / XML ---------------- */
function yamlScalar(v){
  const t = typeOf(v);
  if (t === 'null') return 'null';
  if (t === 'boolean' || t === 'number') return String(v);
  const s = String(v);
  if (s === '') return "''";
  if (/^\s|\s$/.test(s) || /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: |:$/.test(s) ||
      /^(true|false|null|yes|no|~)$/i.test(s) || /^-?\d+(\.\d+)?$/.test(s) ||
      s.includes('\n') || s.includes('"') || s.includes("'")){
    return '"' + s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n') + '"';
  }
  return s;
}
function jsonToYaml(value, indent){
  indent = indent || 0;
  const pad = '  '.repeat(indent);
  const t = typeOf(value);
  if (t === 'object'){
    const keys = Object.keys(value);
    if (keys.length === 0) return pad + '{}\n';
    return keys.map(k => {
      const v = value[k];
      const vt = typeOf(v);
      const keyStr = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : yamlScalar(k);
      if (vt === 'object' && Object.keys(v).length) return pad + keyStr + ':\n' + jsonToYaml(v, indent+1);
      if (vt === 'array' && v.length) return pad + keyStr + ':\n' + jsonToYaml(v, indent);
      return pad + keyStr + ': ' + (vt==='object'?'{}':vt==='array'?'[]':yamlScalar(v)) + '\n';
    }).join('');
  }
  if (t === 'array'){
    if (value.length === 0) return pad + '[]\n';
    return value.map(v => {
      const vt = typeOf(v);
      if (vt === 'object' && Object.keys(v).length){ const inner = jsonToYaml(v, indent+1); return pad + '- ' + inner.trimStart(); }
      if (vt === 'array' && v.length){ const inner = jsonToYaml(v, indent+1); return pad + '- ' + inner.trimStart(); }
      return pad + '- ' + (vt==='object'?'{}':vt==='array'?'[]':yamlScalar(v)) + '\n';
    }).join('');
  }
  return pad + yamlScalar(value) + '\n';
}
function xmlEscape(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sanitizeTag(name){
  let s = String(name).replace(/[^A-Za-z0-9_.-]/g, '_');
  if (!/^[A-Za-z_]/.test(s)) s = '_' + s;
  return s || 'item';
}
function jsonToXmlNode(key, value, indent){
  const pad = '  '.repeat(indent);
  const tag = sanitizeTag(key);
  const t = typeOf(value);
  if (t === 'object'){
    const keys = Object.keys(value);
    if (!keys.length) return pad + '<' + tag + '/>\n';
    return pad + '<' + tag + '>\n' + keys.map(k => jsonToXmlNode(k, value[k], indent+1)).join('') + pad + '</' + tag + '>\n';
  }
  if (t === 'array'){
    if (!value.length) return pad + '<' + tag + '/>\n';
    return value.map(v => jsonToXmlNode(tag, v, indent)).join('');
  }
  if (t === 'null') return pad + '<' + tag + '/>\n';
  return pad + '<' + tag + '>' + xmlEscape(value) + '</' + tag + '>\n';
}
function jsonToXml(value, rootName){
  rootName = rootName || 'root';
  const t = typeOf(value);
  let body;
  if (t === 'array') body = value.map(v => jsonToXmlNode('item', v, 1)).join('');
  else if (t === 'object') body = Object.keys(value).map(k => jsonToXmlNode(k, value[k], 1)).join('');
  else body = '  ' + xmlEscape(value) + '\n';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<' + sanitizeTag(rootName) + '>\n' + body + '</' + sanitizeTag(rootName) + '>\n';
}

/* ---------------- path extractor ---------------- */
function parsePathTokens(path){
  const tokens = [];
  let rest = path.trim();
  if (rest.startsWith('$')) rest = rest.slice(1);
  const re = /^\.?([A-Za-z0-9_]+)|^\[(\*|\d+|"[^"]*"|'[^']*')\]/;
  while (rest.length){
    const m = rest.match(re);
    if (!m) throw new Error('Cannot parse path near: ' + rest.slice(0,20));
    if (m[1] !== undefined) tokens.push(m[1]);
    else {
      let t = m[2];
      if (t === '*') tokens.push('*');
      else if (/^\d+$/.test(t)) tokens.push(Number(t));
      else tokens.push(t.slice(1,-1));
    }
    rest = rest.slice(m[0].length);
  }
  if (!tokens.length) throw new Error('Enter a path, e.g. driver.name or vehicles[*].regNo');
  return tokens;
}
function extractPath(value, tokens){
  if (tokens.length === 0) return value;
  const [head, ...restTokens] = tokens;
  if (head === '*'){
    if (typeOf(value) !== 'array') throw new Error('[*] was used on a value that is not an array');
    return value.map(item => extractPath(item, restTokens));
  }
  if (value === undefined || value === null) throw new Error('Path does not exist (hit null/undefined before the end of the path)');
  const t = typeOf(value);
  if (t !== 'object' && t !== 'array') throw new Error('Cannot look up "' + head + '" inside a ' + t + ' value');
  if (typeOf(value) === 'array' && typeof head !== 'number') throw new Error('Expected an array index like [0], got "' + head + '"');
  return extractPath(value[head], restTokens);
}

/* ---------------- CSV helper ---------------- */
function rowsToCsv(rows, cols){
  function esc(v){
    if (v===undefined || v===null) v='';
    v = String(v);
    if (/[",\n]/.test(v)) return '"' + v.replace(/"/g,'""') + '"';
    return v;
  }
  const lines = [cols.map(esc).join(',')];
  rows.forEach(r => lines.push(cols.map(c=>esc(r[c])).join(',')));
  return lines.join('\r\n');
}

/* ================= FORMAT & VALIDATE ================= */
(function(){
  const input = document.getElementById('fmt-input');
  if (!input) return;
  const output = document.getElementById('fmt-output');
  const treeEl = document.getElementById('fmt-tree');
  const schemaEl = document.getElementById('fmt-schema');
  const errorBox = document.getElementById('fmt-error');
  const sizeMeta = document.getElementById('fmt-input-size');
  const statsRow = document.getElementById('fmt-stats');
  const parseTime = document.getElementById('fmt-parsetime');

  let currentValue, currentFormatted = '', currentSchemaText = '', viewMode = 'code';

  const errorUI = wireErrorBox({
    errorBoxEl: errorBox, repairNoteEl: document.getElementById('fmt-repair-note'), textareaEl: input,
    onAfterRepair: () => runFormat('beautify')
  });
  const upload = wireCompactUpload({
    cardEl: document.getElementById('fmt-card'), fileInputEl: document.getElementById('fmt-file'),
    uploadBtnEl: document.getElementById('fmt-filebtn'), dropHintEl: document.getElementById('fmt-drophint'),
    dropHintBtnEl: document.getElementById('fmt-drophint-btn'), textareaEl: input,
    onText: (text) => { input.value = text; sizeMeta.textContent = formatBytes(byteLength(text)); }
  });

  input.addEventListener('input', () => sizeMeta.textContent = formatBytes(byteLength(input.value)));

  function getIndent(){
    const v = document.getElementById('fmt-indent').value;
    return v === 'tab' ? '\t' : Number(v);
  }
  function sortDeep(v){
    const t = typeOf(v);
    if (t === 'array') return v.map(sortDeep);
    if (t === 'object'){ const out = {}; Object.keys(v).sort().forEach(k => out[k] = sortDeep(v[k])); return out; }
    return v;
  }
  function highlightJson(str){
    if (str.length > 500000) return escapeHtml(str);
    const esc = escapeHtml(str);
    return esc.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) return /:$/.test(match) ? '<span class="k">' + match.replace(/:$/,'') + '</span>:' : '<span class="s">' + match + '</span>';
        if (/true|false/.test(match)) return '<span class="b">' + match + '</span>';
        if (match === 'null') return '<span class="nl">' + match + '</span>';
        return '<span class="n">' + match + '</span>';
      }
    );
  }
  window.__fmtHighlight = highlightJson;

  function runFormat(mode){
    errorUI.clear();
    const text = input.value;
    if (!text.trim()){ errorUI.showPlain('Nothing to format — paste, drop, or upload some JSON first.'); return; }
    const t0 = performance.now();
    const parsed = safeParse(text);
    if (!parsed.ok){
      errorUI.showError('Invalid JSON: ' + parsed.error);
      statsRow.style.display = 'none';
      output.innerHTML = '<span class="p">Fix the error above, then format again.</span>';
      return;
    }
    currentValue = parsed.value;
    currentSchemaText = '';
    const indent = mode === 'minify' ? 0 : getIndent();
    currentFormatted = JSON.stringify(currentValue, null, indent);
    parseTime.textContent = 'parsed & formatted in ' + Math.max(1, Math.round(performance.now()-t0)) + ' ms';

    const stats = computeStats(currentValue);
    document.getElementById('st-size').textContent = formatBytes(byteLength(currentFormatted));
    document.getElementById('st-keys').textContent = stats.keys.toLocaleString();
    document.getElementById('st-depth').textContent = stats.maxDepth;
    document.getElementById('st-arrays').textContent = stats.arrays.toLocaleString();
    document.getElementById('st-items').textContent = stats.arrayItems.toLocaleString();
    statsRow.style.display = 'flex';
    renderOutput();
  }

  function renderOutput(){
    output.style.display = 'none'; treeEl.style.display = 'none'; schemaEl.style.display = 'none';
    if (viewMode === 'code'){
      output.style.display = 'block';
      output.innerHTML = highlightJson(currentFormatted);
    } else if (viewMode === 'tree'){
      treeEl.style.display = 'block'; treeEl.innerHTML = '';
      if (currentValue !== undefined) treeEl.appendChild(buildTreeNode('root', currentValue, true));
    } else if (viewMode === 'schema'){
      schemaEl.style.display = 'block';
      if (currentValue !== undefined){
        if (!currentSchemaText){
          const t0 = performance.now();
          currentSchemaText = JSON.stringify(buildJsonSchema(currentValue), null, 2);
          parseTime.textContent = 'schema generated in ' + Math.max(1, Math.round(performance.now()-t0)) + ' ms';
        }
        schemaEl.innerHTML = highlightJson(currentSchemaText);
      } else {
        schemaEl.innerHTML = '<span class="p">Format some JSON first, then switch to Schema.</span>';
      }
    }
  }

  const ARRAY_PAGE = 100;
  function buildTreeNode(key, value, isTop){
    const t = typeOf(value);
    const row = document.createElement('div');
    row.className = 'tnode' + (isTop ? ' top' : '');
    if (t === 'object' || t === 'array'){
      const keys = t === 'array' ? value.map((_,i)=>i) : Object.keys(value);
      const line = document.createElement('div'); line.className = 'trow';
      const toggle = document.createElement('span'); toggle.className = 'ttoggle'; toggle.textContent = keys.length ? '\u25B8' : ' ';
      line.appendChild(toggle);
      const kEl = document.createElement('span'); kEl.className='tkey'; kEl.textContent = (key==='root'?'':key+': ');
      line.appendChild(kEl);
      const bracket = document.createElement('span'); bracket.className='p'; bracket.textContent = t === 'array' ? '[' : '{';
      line.appendChild(bracket);
      const count = document.createElement('span'); count.className='tcount'; count.textContent = keys.length + (t==='array' ? ' items' : ' keys');
      line.appendChild(count);
      row.appendChild(line);
      const childWrap = document.createElement('div'); childWrap.style.display = 'none';
      let built = false, shown = 0;
      function buildMore(){
        const upper = Math.min(keys.length, shown + ARRAY_PAGE);
        for (let i = shown; i < upper; i++){ const k = keys[i]; childWrap.appendChild(buildTreeNode(t==='array' ? i : k, value[k], false)); }
        shown = upper;
        moreBtn.style.display = shown < keys.length ? 'inline-block' : 'none';
        if (moreBtn.style.display === 'inline-block'){
          moreBtn.textContent = 'Show ' + Math.min(ARRAY_PAGE, keys.length - shown) + ' more of ' + (keys.length - shown) + ' remaining\u2026';
          childWrap.appendChild(moreBtn);
        }
      }
      const moreBtn = document.createElement('span'); moreBtn.className = 'tmore';
      moreBtn.addEventListener('click', (e)=>{ e.stopPropagation(); buildMore(); });
      toggle.addEventListener('click', () => {
        if (!keys.length) return;
        const opening = childWrap.style.display === 'none';
        childWrap.style.display = opening ? 'block' : 'none';
        toggle.textContent = opening ? '\u25BE' : '\u25B8';
        if (opening && !built){ built = true; buildMore(); }
      });
      row.appendChild(childWrap);
    } else {
      const line = document.createElement('div'); line.className = 'trow';
      const spacer = document.createElement('span'); spacer.className='ttoggle'; spacer.textContent=' '; line.appendChild(spacer);
      const kEl = document.createElement('span'); kEl.className='tkey'; kEl.textContent = key + ': '; line.appendChild(kEl);
      const vEl = document.createElement('span');
      if (t === 'string'){ vEl.className='tval-s'; vEl.textContent = JSON.stringify(value); }
      else if (t === 'number'){ vEl.className='tval-n'; vEl.textContent = value; }
      else if (t === 'boolean'){ vEl.className='tval-b'; vEl.textContent = value; }
      else { vEl.className='tval-null'; vEl.textContent = 'null'; }
      line.appendChild(vEl);
      row.appendChild(line);
    }
    return row;
  }

  document.getElementById('fmt-beautify').addEventListener('click', () => runFormat('beautify'));
  document.getElementById('fmt-minify').addEventListener('click', () => runFormat('minify'));
  document.getElementById('fmt-sort').addEventListener('click', () => {
    if (currentValue === undefined) { runFormat('beautify'); if (currentValue===undefined) return; }
    currentValue = sortDeep(currentValue);
    currentFormatted = JSON.stringify(currentValue, null, getIndent());
    renderOutput();
  });
  document.getElementById('fmt-sample').addEventListener('click', () => {
    input.value = JSON.stringify(JSON_SAMPLE, null, 2);
    sizeMeta.textContent = formatBytes(byteLength(input.value));
    upload.updateHint();
    runFormat('beautify');
  });
  document.getElementById('fmt-clear').addEventListener('click', () => {
    input.value=''; sizeMeta.textContent='0 B'; currentValue=undefined; currentFormatted=''; currentSchemaText='';
    output.innerHTML = '<span class="p">Formatted JSON will appear here.</span>';
    treeEl.innerHTML=''; schemaEl.innerHTML=''; statsRow.style.display='none'; errorUI.clear(); parseTime.textContent='';
    upload.updateHint();
    document.getElementById('qry-result-card').classList.remove('show');
  });
  document.getElementById('fmt-view-code').addEventListener('click', () => { viewMode='code'; renderOutput(); });
  document.getElementById('fmt-view-tree').addEventListener('click', () => { viewMode='tree'; renderOutput(); });
  document.getElementById('fmt-view-schema').addEventListener('click', () => { viewMode='schema'; renderOutput(); });
  document.getElementById('fmt-copy').addEventListener('click', () => {
    const text = viewMode === 'schema' ? currentSchemaText : currentFormatted;
    if (text) copyToClipboard(text, 'fmt-copy');
  });
  document.getElementById('fmt-download').addEventListener('click', () => {
    if (viewMode === 'schema'){ if (currentSchemaText) downloadText('schema.json', currentSchemaText); }
    else if (currentFormatted) downloadText('formatted.json', currentFormatted);
  });

  document.getElementById('qry-run').addEventListener('click', () => {
    const path = document.getElementById('qry-path').value.trim();
    const qryCard = document.getElementById('qry-result-card');
    const qryOut = document.getElementById('qry-output');
    const qryMeta = document.getElementById('qry-meta');
    if (!path) return;
    if (currentValue === undefined) runFormat('beautify');
    if (currentValue === undefined) return;
    try{
      const tokens = parsePathTokens(path);
      const result = extractPath(currentValue, tokens);
      qryOut.innerHTML = highlightJson(JSON.stringify(result === undefined ? null : result, null, 2));
      qryMeta.textContent = typeOf(result)==='array' ? result.length.toLocaleString() + ' item(s)' : '';
      qryCard.classList.add('show');
    } catch(e){
      qryOut.innerHTML = '<span style="color:var(--remove)">' + escapeHtml(e.message) + '</span>';
      qryMeta.textContent = '';
      qryCard.classList.add('show');
    }
  });
  document.getElementById('qry-clear').addEventListener('click', () => {
    document.getElementById('qry-path').value = '';
    document.getElementById('qry-result-card').classList.remove('show');
  });
  document.getElementById('qry-path').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('qry-run').click(); });

  window.__fmtGetValue = () => currentValue;
})();

/* ================= COMPARE ================= */
(function(){
  const leftEl = document.getElementById('cmp-left');
  if (!leftEl) return;
  const rightEl = document.getElementById('cmp-right');
  const leftErrorBox = document.getElementById('cmp-left-error');
  const rightErrorBox = document.getElementById('cmp-right-error');
  const warnBox = document.getElementById('cmp-warn');
  const statsRow = document.getElementById('cmp-stats');
  const resultCard = document.getElementById('cmp-result-card');
  const treeEl = document.getElementById('cmp-tree');
  const exportBtn = document.getElementById('cmp-export');

  let lastChanges = [];

  const leftErrorUI = wireErrorBox({ errorBoxEl: leftErrorBox, repairNoteEl: document.getElementById('cmp-left-repair-note'), textareaEl: leftEl });
  const rightErrorUI = wireErrorBox({ errorBoxEl: rightErrorBox, repairNoteEl: document.getElementById('cmp-right-repair-note'), textareaEl: rightEl });

  const leftUpload = wireCompactUpload({
    cardEl: document.getElementById('cmp-left-card'), fileInputEl: document.getElementById('cmp-left-file'),
    uploadBtnEl: document.getElementById('cmp-left-filebtn'), dropHintEl: document.getElementById('cmp-left-drophint'),
    dropHintBtnEl: document.getElementById('cmp-left-drophint-btn'), textareaEl: leftEl,
    onText: (text) => { leftEl.value = text; document.getElementById('cmp-left-size').textContent = formatBytes(byteLength(text)); }
  });
  const rightUpload = wireCompactUpload({
    cardEl: document.getElementById('cmp-right-card'), fileInputEl: document.getElementById('cmp-right-file'),
    uploadBtnEl: document.getElementById('cmp-right-filebtn'), dropHintEl: document.getElementById('cmp-right-drophint'),
    dropHintBtnEl: document.getElementById('cmp-right-drophint-btn'), textareaEl: rightEl,
    onText: (text) => { rightEl.value = text; document.getElementById('cmp-right-size').textContent = formatBytes(byteLength(text)); }
  });

  leftEl.addEventListener('input', () => document.getElementById('cmp-left-size').textContent = formatBytes(byteLength(leftEl.value)));
  rightEl.addEventListener('input', () => document.getElementById('cmp-right-size').textContent = formatBytes(byteLength(rightEl.value)));

  document.getElementById('cmp-sample').addEventListener('click', () => {
    leftEl.value = JSON.stringify(JSON_SAMPLE, null, 2);
    rightEl.value = JSON.stringify(JSON_SAMPLE_RIGHT, null, 2);
    document.getElementById('cmp-left-size').textContent = formatBytes(byteLength(leftEl.value));
    document.getElementById('cmp-right-size').textContent = formatBytes(byteLength(rightEl.value));
    leftUpload.updateHint(); rightUpload.updateHint();
  });
  document.getElementById('cmp-swap').addEventListener('click', () => {
    const tmp = leftEl.value; leftEl.value = rightEl.value; rightEl.value = tmp;
    document.getElementById('cmp-left-size').textContent = formatBytes(byteLength(leftEl.value));
    document.getElementById('cmp-right-size').textContent = formatBytes(byteLength(rightEl.value));
    leftUpload.updateHint(); rightUpload.updateHint();
  });

  function buildDiffNode(key, path, a, b, opts){
    const hasA = a !== undefined, hasB = b !== undefined;
    if (!hasA && hasB) return { key, path, kind:'added', value:b };
    if (hasA && !hasB) return { key, path, kind:'removed', value:a };
    let av = a, bv = b;
    if (opts.ignoreCase && typeof av === 'string') av = av.toLowerCase();
    if (opts.ignoreCase && typeof bv === 'string') bv = bv.toLowerCase();
    const tA = typeOf(a), tB = typeOf(b);
    if (tA !== tB) return { key, path, kind:'modified', oldValue:a, newValue:b };
    if (tA === 'object'){
      const keysA = Object.keys(a), keysB = Object.keys(b);
      const allKeys = Array.from(new Set(keysA.concat(keysB)));
      const children = []; let changed = false;
      for (const k of allKeys){
        const child = buildDiffNode(k, path ? path+'.'+k : k, a[k], b[k], opts);
        if (child.kind !== 'unchanged') changed = true;
        children.push(child);
      }
      return { key, path, kind: changed?'container-changed':'unchanged', type:'object', children };
    }
    if (tA === 'array'){
      const children = []; let changed = false;
      if (opts.ignoreArrayOrder){
        const strA = a.map(x => JSON.stringify(opts.ignoreCase ? lowerDeep(x) : x));
        const strB = b.map(x => JSON.stringify(opts.ignoreCase ? lowerDeep(x) : x));
        const bBuckets = new Map();
        for (let j=0;j<strB.length;j++){ const key2 = strB[j]; if (!bBuckets.has(key2)) bBuckets.set(key2, []); bBuckets.get(key2).push(j); }
        const usedB = new Array(b.length).fill(false);
        for (let i=0;i<a.length;i++){
          const bucket = bBuckets.get(strA[i]);
          let idx = -1;
          if (bucket){ while (bucket.length){ const cand = bucket.shift(); if (!usedB[cand]){ idx = cand; break; } } }
          if (idx===-1){ children.push({key:i, path:path+'['+i+']', kind:'removed', value:a[i]}); changed=true; }
          else { usedB[idx]=true; children.push({key:i, path:path+'['+i+']', kind:'unchanged', value:a[i]}); }
        }
        for (let j=0;j<b.length;j++) if (!usedB[j]){ children.push({key:j, path:path+'['+j+']', kind:'added', value:b[j]}); changed=true; }
      } else {
        const maxLen = Math.max(a.length, b.length);
        for (let i=0;i<maxLen;i++){
          const child = buildDiffNode(i, path+'['+i+']', a[i], b[i], opts);
          if (child.kind !== 'unchanged') changed = true;
          children.push(child);
        }
      }
      return { key, path, kind: changed?'container-changed':'unchanged', type:'array', children };
    }
    if (av === bv) return { key, path, kind:'unchanged', value:a };
    return { key, path, kind:'modified', oldValue:a, newValue:b };
  }
  function lowerDeep(v){
    const t = typeOf(v);
    if (t==='string') return v.toLowerCase();
    if (t==='array') return v.map(lowerDeep);
    if (t==='object'){ const o={}; Object.keys(v).forEach(k=>o[k]=lowerDeep(v[k])); return o; }
    return v;
  }
  function flattenChanges(node, out){
    out = out || [];
    if (node.type === 'object' || node.type === 'array') node.children.forEach(c => flattenChanges(c, out));
    else if (node.kind !== 'unchanged') out.push(node);
    return out;
  }
  function countKind(node, counts){
    counts = counts || { added:0, removed:0, modified:0, unchanged:0 };
    if (node.type === 'object' || node.type === 'array') node.children.forEach(c => countKind(c, counts));
    else counts[node.kind] = (counts[node.kind]||0) + 1;
    return counts;
  }
  function valuePreview(v){
    const t = typeOf(v);
    if (t === 'object') return '{' + Object.keys(v).length + ' keys}';
    if (t === 'array') return '[' + v.length + ' items]';
    if (t === 'string') return JSON.stringify(v);
    return String(v);
  }

  const DIFF_PAGE = 150;
  function renderDiffNode(node, isTop){
    const wrap = document.createElement('div');
    if (node.type === 'object' || node.type === 'array'){
      const row = document.createElement('div'); row.className = 'drow container';
      const toggle = document.createElement('span'); toggle.className='dtoggle';
      const hasChildren = node.children.length > 0;
      toggle.textContent = hasChildren ? (isTop ? '\u25BE' : '\u25B8') : ' ';
      row.appendChild(toggle);
      const kEl = document.createElement('span'); kEl.className='dkey';
      kEl.textContent = (node.path === '' ? '(root)' : node.key) + (node.type==='array' ? ' [' : ' {');
      row.appendChild(kEl);
      const meta = document.createElement('span'); meta.className='tcount';
      meta.textContent = node.children.length + (node.type==='array'?' items':' keys') + (node.kind==='unchanged' ? ' \u00B7 unchanged' : '');
      row.appendChild(meta);
      wrap.appendChild(row);
      const childWrap = document.createElement('div'); childWrap.className = 'dchildren'; childWrap.style.display = isTop ? 'block' : 'none';
      let built = false, shown = 0;
      function buildMore(){
        const upper = Math.min(node.children.length, shown + DIFF_PAGE);
        for (let i=shown;i<upper;i++) childWrap.insertBefore(renderDiffNode(node.children[i], false), moreBtn);
        shown = upper;
        moreBtn.style.display = shown < node.children.length ? 'inline-block' : 'none';
        if (moreBtn.style.display==='inline-block') moreBtn.textContent = 'Show ' + Math.min(DIFF_PAGE, node.children.length-shown) + ' more of ' + (node.children.length-shown) + ' remaining\u2026';
      }
      const moreBtn = document.createElement('span'); moreBtn.className = 'tmore';
      moreBtn.addEventListener('click', (e)=>{ e.stopPropagation(); buildMore(); });
      childWrap.appendChild(moreBtn);
      if (isTop && hasChildren){ built = true; buildMore(); }
      toggle.addEventListener('click', () => {
        if (!hasChildren) return;
        const opening = childWrap.style.display === 'none';
        childWrap.style.display = opening ? 'block' : 'none';
        toggle.textContent = opening ? '\u25BE' : '\u25B8';
        if (opening && !built){ built = true; buildMore(); }
      });
      wrap.appendChild(childWrap);
      return wrap;
    }
    const row = document.createElement('div'); row.className = 'drow ' + node.kind;
    const sign = document.createElement('span'); sign.className='dsign';
    sign.textContent = node.kind==='added' ? '+' : node.kind==='removed' ? '\u2212' : node.kind==='modified' ? '~' : ' ';
    row.appendChild(sign);
    const kEl = document.createElement('span'); kEl.className='dkey'; kEl.textContent = node.key + ': ';
    row.appendChild(kEl);
    if (node.kind === 'modified'){
      const oldSpan = document.createElement('span'); oldSpan.className='dval old'; oldSpan.textContent = valuePreview(node.oldValue);
      const arrow = document.createElement('span'); arrow.className='p'; arrow.textContent=' \u2192 ';
      const newSpan = document.createElement('span'); newSpan.className='dval new'; newSpan.textContent = valuePreview(node.newValue);
      row.appendChild(oldSpan); row.appendChild(arrow); row.appendChild(newSpan);
    } else {
      const vSpan = document.createElement('span');
      vSpan.className = 'dval' + (node.kind==='removed' ? ' old' : node.kind==='added' ? ' new' : '');
      vSpan.textContent = valuePreview(node.value);
      row.appendChild(vSpan);
    }
    return row;
  }

  document.getElementById('cmp-run').addEventListener('click', () => {
    leftErrorUI.clear(); rightErrorUI.clear(); warnBox.classList.remove('show');
    const lp = safeParse(leftEl.value);
    const rp = safeParse(rightEl.value);
    if (!lp.ok || !rp.ok){
      if (!lp.ok) leftErrorUI.showError('Invalid JSON: ' + lp.error);
      if (!rp.ok) rightErrorUI.showError('Invalid JSON: ' + rp.error);
      statsRow.style.display='none'; resultCard.style.display='none'; exportBtn.disabled = true;
      return;
    }
    const leftStats = computeStats(lp.value), rightStats = computeStats(rp.value);
    if (leftStats.arrayItems + rightStats.arrayItems > 50000){
      warnBox.textContent = 'This is a large document (' + (leftStats.arrayItems+rightStats.arrayItems).toLocaleString() + ' array items across both sides). Comparison may take a moment.';
      warnBox.classList.add('show');
    }
    const opts = { ignoreArrayOrder: document.getElementById('cmp-ignore-order').checked, ignoreCase: document.getElementById('cmp-ignore-case').checked };
    setTimeout(() => {
      const tree = buildDiffNode(null, '', lp.value, rp.value, opts);
      lastChanges = flattenChanges(tree);
      const counts = countKind(tree);
      document.getElementById('cst-added').textContent = counts.added.toLocaleString();
      document.getElementById('cst-removed').textContent = counts.removed.toLocaleString();
      document.getElementById('cst-modified').textContent = counts.modified.toLocaleString();
      document.getElementById('cst-unchanged').textContent = counts.unchanged.toLocaleString();
      statsRow.style.display = 'flex';
      treeEl.innerHTML = '';
      treeEl.appendChild(renderDiffNode(tree, true));
      resultCard.style.display = 'flex';
      exportBtn.disabled = lastChanges.length === 0;
    }, 10);
  });

  document.getElementById('cmp-export').addEventListener('click', () => {
    if (!lastChanges.length) return;
    const rows = lastChanges.map(c => ({
      Path: c.path || '(root)',
      Change: c.kind === 'added' ? 'Added' : c.kind === 'removed' ? 'Removed' : 'Modified',
      'Old Value': c.kind === 'modified' ? stringifyCell(c.oldValue) : (c.kind==='removed' ? stringifyCell(c.value) : ''),
      'New Value': c.kind === 'modified' ? stringifyCell(c.newValue) : (c.kind==='added' ? stringifyCell(c.value) : '')
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:34},{wch:11},{wch:36},{wch:36}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diff');
    XLSX.writeFile(wb, 'json-diff.xlsx');
  });
  function stringifyCell(v){
    const t = typeOf(v);
    if (t==='object' || t==='array') return JSON.stringify(v);
    if (t==='undefined') return '';
    return String(v);
  }
})();

/* ================= EXPORT ================= */
(function(){
  const input = document.getElementById('xl-input');
  if (!input) return;
  const errorBox = document.getElementById('xl-error');
  const warnBox = document.getElementById('xl-warn');
  const sizeMeta = document.getElementById('xl-input-size');
  const statsRow = document.getElementById('xl-stats');
  const previewCard = document.getElementById('xl-preview-card');
  const previewTable = document.getElementById('xl-preview-table');
  const previewTableWrap = document.getElementById('xl-preview-table-wrap');
  const previewCode = document.getElementById('xl-preview-code');
  const previewNote = document.getElementById('xl-preview-note');
  const configTabular = document.getElementById('xl-config-tabular');
  const configTree = document.getElementById('xl-config-tree');
  const downloadBtn = document.getElementById('xl-download');

  let mainRows = null, mainCols = null, treeText = null, currentFormat = 'xlsx';

  const errorUI = wireErrorBox({ errorBoxEl: errorBox, repairNoteEl: document.getElementById('xl-repair-note'), textareaEl: input });
  const upload = wireCompactUpload({
    cardEl: document.getElementById('xl-card'), fileInputEl: document.getElementById('xl-file'),
    uploadBtnEl: document.getElementById('xl-filebtn'), dropHintEl: document.getElementById('xl-drophint'),
    dropHintBtnEl: document.getElementById('xl-drophint-btn'), textareaEl: input,
    onText: (text) => { input.value = text; sizeMeta.textContent = formatBytes(byteLength(text)); }
  });
  input.addEventListener('input', () => sizeMeta.textContent = formatBytes(byteLength(input.value)));

  document.querySelectorAll('#xl-format-pills .fpill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#xl-format-pills .fpill').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentFormat = btn.dataset.fmt;
      const isTabular = currentFormat === 'xlsx' || currentFormat === 'csv';
      configTabular.style.display = isTabular ? 'flex' : 'none';
      configTree.style.display = isTabular ? 'none' : 'flex';
      document.getElementById('xl-sheetname-field').style.display = currentFormat === 'xlsx' ? 'flex' : 'none';
      previewCard.style.display = 'none';
    });
  });

  document.getElementById('xl-sample').addEventListener('click', () => {
    input.value = JSON.stringify([JSON_SAMPLE, JSON_SAMPLE_RIGHT], null, 2);
    sizeMeta.textContent = formatBytes(byteLength(input.value));
    upload.updateHint();
  });
  document.getElementById('xl-clear').addEventListener('click', () => {
    input.value=''; sizeMeta.textContent='0 B'; statsRow.style.display='none'; previewCard.style.display='none';
    errorUI.clear(); warnBox.classList.remove('show'); upload.updateHint();
  });
  document.getElementById('xl-usefmt').addEventListener('click', () => {
    const v = window.__fmtGetValue && window.__fmtGetValue();
    if (v === undefined){ errorUI.showPlain('No formatted JSON yet — format something on the Format tab first.'); return; }
    input.value = JSON.stringify(v);
    sizeMeta.textContent = formatBytes(byteLength(input.value));
    upload.updateHint();
    errorUI.clear();
  });

  function flattenObject(obj, prefix, out, arrayMode){
    out = out || {};
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      const path = prefix ? prefix + '.' + key : key;
      const t = typeOf(val);
      if (t === 'object') flattenObject(val, path, out, arrayMode);
      else if (t === 'array'){
        if (arrayMode === 'json') out[path] = JSON.stringify(val);
        else out[path] = val.map(x => typeOf(x)==='object'||typeOf(x)==='array' ? JSON.stringify(x) : String(x)).join(', ');
      } else out[path] = val === null ? '' : val;
    });
    return out;
  }
  function rowFromObject(obj, arrayMode, flatten){
    if (!flatten){
      const row = {};
      Object.keys(obj).forEach(k => {
        const t = typeOf(obj[k]);
        if (t === 'object') row[k] = JSON.stringify(obj[k]);
        else if (t === 'array') row[k] = arrayMode==='json' ? JSON.stringify(obj[k]) : obj[k].map(x => typeOf(x)==='object'||typeOf(x)==='array'?JSON.stringify(x):String(x)).join(', ');
        else row[k] = obj[k] === null ? '' : obj[k];
      });
      return row;
    }
    return flattenObject(obj, '', {}, arrayMode);
  }
  function buildRowsFromJson(value, arrayMode, flatten){
    const t = typeOf(value);
    let records;
    if (t === 'array') records = value;
    else if (t === 'object') records = [value];
    else records = [{ value: value }];
    const rows = records.map(r => { const rt = typeOf(r); return rt === 'object' ? rowFromObject(r, arrayMode, flatten) : { value: r }; });
    const colSet = []; const seen = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => { if(!seen.has(k)){ seen.add(k); colSet.push(k); } }));
    return { rows, cols: colSet };
  }

  document.getElementById('xl-build').addEventListener('click', () => {
    errorUI.clear(); warnBox.classList.remove('show');
    const parsed = safeParse(input.value);
    if (!parsed.ok){
      errorUI.showError('Invalid JSON: ' + parsed.error);
      statsRow.style.display='none'; previewCard.style.display='none';
      return;
    }
    const stats = computeStats(parsed.value);
    if (stats.arrayItems > 100000){
      warnBox.textContent = 'This JSON has ' + stats.arrayItems.toLocaleString() + ' array items in total. Export will proceed but may take a while.';
      warnBox.classList.add('show');
    }
    const isTabular = currentFormat === 'xlsx' || currentFormat === 'csv';
    const arrayMode = document.getElementById('xl-arraymode').value;
    const flatten = document.getElementById('xl-flatten').checked;
    const rootName = document.getElementById('xl-rootname').value || 'root';

    setTimeout(() => {
      if (isTabular){
        const { rows, cols } = buildRowsFromJson(parsed.value, arrayMode === 'json' ? 'json' : 'join', flatten);
        mainRows = rows; mainCols = cols; treeText = null;
        document.getElementById('xst-rows').textContent = rows.length.toLocaleString();
        document.getElementById('xst-cols').textContent = cols.length.toLocaleString();
        document.getElementById('xst-sheets').textContent = '1';
        statsRow.style.display = 'flex';
        renderTablePreview(rows, cols);
        previewTableWrap.style.display = 'block'; previewCode.style.display = 'none';
      } else {
        mainRows = null; mainCols = null;
        treeText = currentFormat === 'yaml' ? jsonToYaml(parsed.value) : jsonToXml(parsed.value, rootName);
        statsRow.style.display = 'none';
        previewNote.textContent = formatBytes(byteLength(treeText));
        previewCode.textContent = treeText;
        previewTableWrap.style.display = 'none'; previewCode.style.display = 'block';
      }
      previewCard.style.display = 'flex';
      downloadBtn.textContent = 'Download .' + currentFormat;
    }, 10);
  });

  function renderTablePreview(rows, cols){
    const PREVIEW_ROWS = 200;
    const shown = rows.slice(0, PREVIEW_ROWS);
    previewNote.textContent = '(' + Math.min(PREVIEW_ROWS, rows.length).toLocaleString() + ' of ' + rows.length.toLocaleString() + ' rows shown)';
    let html = '<thead><tr>' + cols.map(c => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr></thead><tbody>';
    for (const r of shown) html += '<tr>' + cols.map(c => '<td>' + escapeHtml(r[c] === undefined ? '' : r[c]) + '</td>').join('') + '</tr>';
    html += '</tbody>';
    previewTable.innerHTML = html;
  }

  downloadBtn.addEventListener('click', () => {
    if (currentFormat === 'xlsx'){
      if (!mainRows) return;
      const sheetName = (document.getElementById('xl-sheetname').value || 'Data').slice(0,31);
      const ws = XLSX.utils.json_to_sheet(mainRows, { header: mainCols });
      ws['!cols'] = mainCols.map(c => ({ wch: Math.min(40, Math.max(10, c.length + 2)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, 'export.xlsx');
    } else if (currentFormat === 'csv'){
      if (!mainRows) return;
      downloadText('export.csv', rowsToCsv(mainRows, mainCols), 'text/csv');
    } else if (currentFormat === 'yaml'){
      if (treeText) downloadText('export.yaml', treeText, 'text/yaml');
    } else if (currentFormat === 'xml'){
      if (treeText) downloadText('export.xml', treeText, 'application/xml');
    }
  });

  document.getElementById('xl-copy').addEventListener('click', () => {
    let text = '';
    if (currentFormat === 'xlsx' || currentFormat === 'csv'){ if (!mainRows) return; text = rowsToCsv(mainRows, mainCols); }
    else { if (!treeText) return; text = treeText; }
    copyToClipboard(text, 'xl-copy');
  });
})();
