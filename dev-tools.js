"use strict";

/* ---------- UTF-8 safe base64 helpers (shared) ---------- */
function b64EncodeUtf8(str){
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64DecodeUtf8(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function b64UrlDecode(str){
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while (str.length % 4) str += '=';
  return b64DecodeUtf8(str);
}

/* ---------- MD5 (RFC 1321), tested against official vectors ---------- */
function md5(str){
  function rotl(n, s){ return (n << s) | (n >>> (32 - s)); }
  function toUtf8Bytes(s){
    const bytes = [];
    for (let i=0;i<s.length;i++){
      let c = s.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800){ bytes.push(0xc0|(c>>6), 0x80|(c&0x3f)); }
      else if (c < 0x10000){ bytes.push(0xe0|(c>>12), 0x80|((c>>6)&0x3f), 0x80|(c&0x3f)); }
      else { bytes.push(0xf0|(c>>18), 0x80|((c>>12)&0x3f), 0x80|((c>>6)&0x3f), 0x80|(c&0x3f)); }
    }
    return bytes;
  }
  const K = new Int32Array([
    -680876936,-389564586,606105819,-1044525330,-176418897,1200080426,-1473231341,-45705983,
    1770035416,-1958414417,-42063,-1990404162,1804603682,-40341101,-1502002290,1236535329,
    -165796510,-1069501632,643717713,-373897302,-701558691,38016083,-660478335,-405537848,
    568446438,-1019803690,-187363961,1163531501,-1444681467,-51403784,1735328473,-1926607734,
    -378558,-2022574463,1839030562,-35309556,-1530992060,1272893353,-155497632,-1094730640,
    681279174,-358537222,-722521979,76029189,-640364487,-421815835,530742520,-995338651,
    -198630844,1126891415,-1416354905,-57434055,1700485571,-1894986606,-1051523,-2054922799,
    1873313359,-30611744,-1560198380,1309151649,-145523070,-1120210379,718787259,-343485551
  ]);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const bytes = toUtf8Bytes(str);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i=0;i<8;i++) bytes.push((bitLen / Math.pow(2, i*8)) & 0xff);
  let a0=1732584193,b0=-271733879,c0=-1732584194,d0=271733878;
  for (let chunkStart=0; chunkStart<bytes.length; chunkStart+=64){
    const M = new Int32Array(16);
    for (let j=0;j<16;j++){ const o=chunkStart+j*4; M[j] = bytes[o] | (bytes[o+1]<<8) | (bytes[o+2]<<16) | (bytes[o+3]<<24); }
    let A=a0,B=b0,C=c0,D=d0;
    for (let i=0;i<64;i++){
      let F,g;
      if (i<16){ F=(B&C)|(~B&D); g=i; }
      else if (i<32){ F=(D&B)|(~D&C); g=(5*i+1)%16; }
      else if (i<48){ F=B^C^D; g=(3*i+5)%16; }
      else { F=C^(B|~D); g=(7*i)%16; }
      F = (F+A+K[i]+M[g])|0;
      A=D; D=C; C=B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0=(a0+A)|0; b0=(b0+B)|0; c0=(c0+C)|0; d0=(d0+D)|0;
  }
  function toHexLE(n){ let out=''; for (let i=0;i<4;i++) out += ((n>>>(i*8))&0xff).toString(16).padStart(2,'0'); return out; }
  return toHexLE(a0)+toHexLE(b0)+toHexLE(c0)+toHexLE(d0);
}

async function sha(str, algo){
  const bytes = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest(algo, bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ================= BASE64 ================= */
(function(){
  const input = document.getElementById('b64-input');
  if (!input) return;
  const output = document.getElementById('b64-output');
  const errorBox = document.getElementById('b64-error');
  function run(mode){
    errorBox.classList.remove('show');
    try{
      output.value = mode === 'encode' ? b64EncodeUtf8(input.value) : b64DecodeUtf8(input.value.trim());
    } catch(e){
      errorBox.textContent = 'Could not decode: ' + e.message;
      errorBox.classList.add('show');
      output.value = '';
    }
  }
  document.getElementById('b64-encode').addEventListener('click', () => run('encode'));
  document.getElementById('b64-decode').addEventListener('click', () => run('decode'));
  document.getElementById('b64-swap').addEventListener('click', () => { input.value = output.value; output.value = ''; });
  document.getElementById('b64-copy').addEventListener('click', () => output.value && copyToClipboard(output.value, 'b64-copy'));
  document.getElementById('b64-clear').addEventListener('click', () => { input.value=''; output.value=''; errorBox.classList.remove('show'); });
})();

/* ================= URL ENCODE ================= */
(function(){
  const input = document.getElementById('url-input');
  if (!input) return;
  const output = document.getElementById('url-output');
  const errorBox = document.getElementById('url-error');
  const modeSel = document.getElementById('url-mode');
  function run(mode){
    errorBox.classList.remove('show');
    try{
      const fn = modeSel.value === 'component' ? (mode==='encode'?encodeURIComponent:decodeURIComponent) : (mode==='encode'?encodeURI:decodeURI);
      output.value = fn(input.value);
    } catch(e){
      errorBox.textContent = 'Could not decode: ' + e.message;
      errorBox.classList.add('show');
      output.value = '';
    }
  }
  document.getElementById('url-encode').addEventListener('click', () => run('encode'));
  document.getElementById('url-decode').addEventListener('click', () => run('decode'));
  document.getElementById('url-swap').addEventListener('click', () => { input.value = output.value; output.value = ''; });
  document.getElementById('url-copy').addEventListener('click', () => output.value && copyToClipboard(output.value, 'url-copy'));
  document.getElementById('url-clear').addEventListener('click', () => { input.value=''; output.value=''; errorBox.classList.remove('show'); });
})();

/* ================= JWT DECODER ================= */
(function(){
  const input = document.getElementById('jwt-input');
  if (!input) return;
  const headerOut = document.getElementById('jwt-header');
  const payloadOut = document.getElementById('jwt-payload');
  const sigOut = document.getElementById('jwt-sig');
  const errorBox = document.getElementById('jwt-error');
  const expInfo = document.getElementById('jwt-exp-info');

  function decode(){
    errorBox.classList.remove('show');
    expInfo.textContent = '';
    const token = input.value.trim();
    if (!token){ headerOut.textContent=''; payloadOut.textContent=''; sigOut.textContent=''; return; }
    const parts = token.split('.');
    if (parts.length < 2){
      errorBox.textContent = 'That doesn\u2019t look like a JWT (expected header.payload.signature).';
      errorBox.classList.add('show');
      return;
    }
    try{
      const header = JSON.parse(b64UrlDecode(parts[0]));
      const payload = JSON.parse(b64UrlDecode(parts[1]));
      headerOut.textContent = JSON.stringify(header, null, 2);
      payloadOut.textContent = JSON.stringify(payload, null, 2);
      sigOut.textContent = parts[2] || '(none)';
      if (payload.exp){
        const expDate = new Date(payload.exp * 1000);
        const now = new Date();
        expInfo.textContent = (expDate < now ? '\u26A0\uFE0F Expired ' : '\u2713 Expires ') + expDate.toLocaleString();
      }
    } catch(e){
      errorBox.textContent = 'Could not decode this token: ' + e.message;
      errorBox.classList.add('show');
    }
  }
  input.addEventListener('input', decode);
  document.getElementById('jwt-sample').addEventListener('click', () => {
    input.value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    decode();
  });
  document.getElementById('jwt-clear').addEventListener('click', () => { input.value=''; decode(); });
})();

/* ================= HASH GENERATOR ================= */
(function(){
  const input = document.getElementById('hash-input');
  if (!input) return;
  const rows = { md5:'hash-md5', sha1:'hash-sha1', sha256:'hash-sha256', sha512:'hash-sha512' };

  async function run(){
    const text = input.value;
    document.getElementById(rows.md5).textContent = text ? md5(text) : '';
    if (!text){ Object.values(rows).forEach(id => { if (id!==rows.md5) document.getElementById(id).textContent=''; }); return; }
    document.getElementById(rows.sha1).textContent = await sha(text, 'SHA-1');
    document.getElementById(rows.sha256).textContent = await sha(text, 'SHA-256');
    document.getElementById(rows.sha512).textContent = await sha(text, 'SHA-512');
  }
  input.addEventListener('input', run);
  document.querySelectorAll('[data-hash-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.hashCopy);
      if (el.textContent) copyToClipboard(el.textContent, null).then(() => flashButton(btn, 'Copied!'));
    });
  });
  document.getElementById('hash-clear').addEventListener('click', () => { input.value=''; run(); });
})();

/* ================= UUID GENERATOR ================= */
(function(){
  const listEl = document.getElementById('uuid-list');
  if (!listEl) return;
  const countSel = document.getElementById('uuid-count');
  const upperCheck = document.getElementById('uuid-upper');
  const hyphenCheck = document.getElementById('uuid-hyphens');

  function genOne(){
    let id = (crypto.randomUUID ? crypto.randomUUID() : fallbackUuid());
    if (!hyphenCheck.checked) id = id.replace(/-/g,'');
    if (upperCheck.checked) id = id.toUpperCase();
    return id;
  }
  function fallbackUuid(){
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2,'0'));
    return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
  }
  function render(){
    listEl.innerHTML = '';
    const n = Number(countSel.value);
    for (let i=0;i<n;i++){
      const id = genOne();
      const row = document.createElement('div'); row.className = 'uuid-item';
      row.innerHTML = `<span>${id}</span>`;
      const btn = document.createElement('button'); btn.className='btn subtle'; btn.textContent='Copy';
      btn.addEventListener('click', () => copyToClipboard(id, null).then(()=>{ btn.textContent='Copied!'; setTimeout(()=>btn.textContent='Copy',1000); }));
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }
  document.getElementById('uuid-generate').addEventListener('click', render);
  document.getElementById('uuid-copy-all').addEventListener('click', () => {
    const ids = Array.from(listEl.querySelectorAll('span')).map(s=>s.textContent).join('\n');
    if (ids) copyToClipboard(ids, 'uuid-copy-all');
  });
  countSel.addEventListener('change', render);
  upperCheck.addEventListener('change', render);
  hyphenCheck.addEventListener('change', render);
  render();
})();

/* ================= PASSWORD GENERATOR ================= */
(function(){
  const display = document.getElementById('pwd-display');
  if (!display) return;
  const lengthInput = document.getElementById('pwd-length');
  const lengthVal = document.getElementById('pwd-length-val');
  const opts = { upper: document.getElementById('pwd-upper'), lower: document.getElementById('pwd-lower'), digits: document.getElementById('pwd-digits'), symbols: document.getElementById('pwd-symbols') };
  const strengthFill = document.getElementById('pwd-strength-fill');
  const strengthLabel = document.getElementById('pwd-strength-label');

  const SETS = { upper:'ABCDEFGHJKLMNPQRSTUVWXYZ', lower:'abcdefghijkmnopqrstuvwxyz', digits:'23456789', symbols:'!@#$%^&*()-_=+[]{}' };

  function generate(){
    let pool = '';
    Object.keys(opts).forEach(k => { if (opts[k].checked) pool += SETS[k]; });
    if (!pool){ display.textContent = 'Pick at least one character set'; return ''; }
    const len = Number(lengthInput.value);
    const bytes = crypto.getRandomValues(new Uint32Array(len));
    let out = '';
    for (let i=0;i<len;i++) out += pool[bytes[i] % pool.length];
    display.textContent = out;
    updateStrength(out, pool.length);
    return out;
  }
  function updateStrength(pw, poolSize){
    const entropy = pw.length * Math.log2(Math.max(2,poolSize));
    let pct, color, label;
    if (entropy < 40){ pct=25; color='var(--remove)'; label='Weak'; }
    else if (entropy < 60){ pct=50; color='var(--modify)'; label='Fair'; }
    else if (entropy < 80){ pct=75; color='#79c0ff'; label='Strong'; }
    else { pct=100; color='var(--add)'; label='Very strong'; }
    strengthFill.style.width = pct + '%';
    strengthFill.style.background = color;
    strengthLabel.textContent = label + ' \u00B7 ~' + Math.round(entropy) + ' bits of entropy';
  }
  lengthInput.addEventListener('input', () => { lengthVal.textContent = lengthInput.value; generate(); });
  Object.values(opts).forEach(el => el.addEventListener('change', generate));
  document.getElementById('pwd-generate').addEventListener('click', generate);
  document.getElementById('pwd-copy').addEventListener('click', () => { const t = display.textContent; if (t && !t.includes(' ')) copyToClipboard(t, 'pwd-copy'); });
  generate();
})();

/* ================= COLOR CONVERTER ================= */
(function(){
  const swatch = document.getElementById('color-swatch');
  if (!swatch) return;
  const hexInput = document.getElementById('color-hex');
  const rgbInput = document.getElementById('color-rgb');
  const hslInput = document.getElementById('color-hsl');
  const picker = document.getElementById('color-picker');

  function hexToRgb(hex){
    hex = hex.replace('#','').trim();
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    const n = parseInt(hex, 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function rgbToHex(r,g,b){ return '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join(''); }
  function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    let h,s,l=(max+min)/2;
    if (max===min){ h=s=0; }
    else{
      const d=max-min;
      s = l>0.5 ? d/(2-max-min) : d/(max+min);
      switch(max){ case r: h=(g-b)/d+(g<b?6:0); break; case g: h=(b-r)/d+2; break; default: h=(r-g)/d+4; }
      h/=6;
    }
    return { h:Math.round(h*360), s:Math.round(s*100), l:Math.round(l*100) };
  }
  function hslToRgb(h,s,l){
    h/=360; s/=100; l/=100;
    let r,g,b;
    if (s===0){ r=g=b=l; }
    else{
      const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
      const q = l<0.5 ? l*(1+s) : l+s-l*s;
      const p = 2*l-q;
      r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
    }
    return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) };
  }
  function isValidHex(h){ return /^#?[0-9a-f]{3}$|^#?[0-9a-f]{6}$/i.test(h.trim()); }

  function updateFromHex(){
    if (!isValidHex(hexInput.value)) return;
    const rgb = hexToRgb(hexInput.value);
    applyAll(rgb);
  }
  function updateFromRgb(){
    const m = rgbInput.value.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return;
    applyAll({ r:+m[1], g:+m[2], b:+m[3] });
  }
  function updateFromHsl(){
    const m = hslInput.value.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return;
    applyAll(hslToRgb(+m[1], +m[2], +m[3]));
  }
  function applyAll(rgb){
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hexInput.value = hex;
    rgbInput.value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    hslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    swatch.style.background = hex;
    picker.value = hex;
  }

  hexInput.addEventListener('input', updateFromHex);
  rgbInput.addEventListener('input', updateFromRgb);
  hslInput.addEventListener('input', updateFromHsl);
  picker.addEventListener('input', () => { hexInput.value = picker.value; updateFromHex(); });
  document.querySelectorAll('[data-color-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = document.getElementById(btn.dataset.colorCopy);
      if (el.value) copyToClipboard(el.value, null).then(()=>flashButton(btn,'Copied!'));
    });
  });

  applyAll({ r:79, g:183, b:255 }); // seed with the app's own accent color
})();

/* ================= REGEX TESTER ================= */
(function(){
  const patternInput = document.getElementById('regex-pattern');
  if (!patternInput) return;
  const testInput = document.getElementById('regex-test');
  const flagsWrap = document.getElementById('regex-flags');
  const resultBox = document.getElementById('regex-results');
  const errorBox = document.getElementById('regex-error');
  const countEl = document.getElementById('regex-count');

  function getFlags(){
    return Array.from(flagsWrap.querySelectorAll('input:checked')).map(i=>i.value).join('');
  }
  function run(){
    errorBox.classList.remove('show');
    resultBox.innerHTML = '';
    const pattern = patternInput.value;
    const text = testInput.value;
    if (!pattern){ countEl.textContent = ''; return; }
    let re;
    try{ re = new RegExp(pattern, getFlags().includes('g') ? getFlags() : getFlags()+'g'); }
    catch(e){ errorBox.textContent = 'Invalid regex: ' + e.message; errorBox.classList.add('show'); countEl.textContent=''; return; }

    const matches = [];
    let m;
    let guard = 0;
    while ((m = re.exec(text)) !== null && guard < 5000){
      matches.push(m);
      guard++;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    countEl.textContent = matches.length + ' match' + (matches.length===1?'':'es');

    // highlighted text view
    let lastIndex = 0, html = '';
    matches.forEach(mm => {
      html += escapeHtml(text.slice(lastIndex, mm.index));
      html += '<span class="match-highlight">' + escapeHtml(mm[0]) + '</span>';
      lastIndex = mm.index + mm[0].length;
    });
    html += escapeHtml(text.slice(lastIndex));
    const highlighted = document.createElement('pre');
    highlighted.className = 'code-out wrap';
    highlighted.style.marginBottom = '10px';
    highlighted.innerHTML = html || '<span class="p">(no text)</span>';
    resultBox.appendChild(highlighted);

    matches.slice(0, 200).forEach((mm, i) => {
      const item = document.createElement('div'); item.className = 'match-item';
      let groupsText = '';
      if (mm.length > 1) groupsText = '  groups: ' + mm.slice(1).map(g => JSON.stringify(g)).join(', ');
      item.innerHTML = '<span class="idx">#' + (i+1) + ' @' + mm.index + '</span>' + escapeHtml(JSON.stringify(mm[0])) + escapeHtml(groupsText);
      resultBox.appendChild(item);
    });
  }
  patternInput.addEventListener('input', run);
  testInput.addEventListener('input', run);
  flagsWrap.addEventListener('change', run);
  document.getElementById('regex-sample').addEventListener('click', () => {
    patternInput.value = '\\b[\\w.+-]+@[\\w-]+\\.[\\w.-]+\\b';
    testInput.value = 'Contact us at support@aequitous.example or sanjay.k@example.co.in for help.';
    run();
  });
})();

/* ================= TEXT DIFF ================= */
(function(){
  const leftEl = document.getElementById('tdiff-left');
  if (!leftEl) return;
  const rightEl = document.getElementById('tdiff-right');
  const outEl = document.getElementById('tdiff-output');
  const statsEl = document.getElementById('tdiff-stats');
  const warnBox = document.getElementById('tdiff-warn');

  function lineDiff(aText, bText){
    const a = aText.split('\n'), b = bText.split('\n');
    const n = a.length, m = b.length;
    const dp = Array.from({length:n+1}, () => new Int32Array(m+1));
    for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--) dp[i][j] = a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
    const ops = []; let i=0, j=0;
    while (i<n && j<m){
      if (a[i]===b[j]){ ops.push({type:'equal', line:a[i]}); i++; j++; }
      else if (dp[i+1][j] >= dp[i][j+1]){ ops.push({type:'remove', line:a[i]}); i++; }
      else { ops.push({type:'add', line:b[j]}); j++; }
    }
    while (i<n){ ops.push({type:'remove', line:a[i]}); i++; }
    while (j<m){ ops.push({type:'add', line:b[j]}); j++; }
    return ops;
  }

  function run(){
    warnBox.classList.remove('show');
    const a = leftEl.value, b = rightEl.value;
    const nLines = a.split('\n').length, mLines = b.split('\n').length;
    if (nLines * mLines > 4000000){
      warnBox.textContent = 'These texts are quite large (' + nLines + ' \u00D7 ' + mLines + ' lines) — diffing may be slow.';
      warnBox.classList.add('show');
    }
    const ops = lineDiff(a, b);
    let added=0, removed=0;
    outEl.innerHTML = '';
    let ln = 0;
    ops.forEach(op => {
      if (op.type==='add') added++;
      if (op.type==='remove') removed++;
      ln++;
      const row = document.createElement('div');
      row.className = 'diff-line ' + (op.type==='add'?'add':op.type==='remove'?'remove':'');
      const sign = op.type==='add'?'+':op.type==='remove'?'\u2212':' ';
      row.innerHTML = `<span class="gutter">${ln}</span><span class="sign">${sign}</span><span class="content"></span>`;
      row.querySelector('.content').textContent = op.line;
      outEl.appendChild(row);
    });
    statsEl.textContent = added + ' added \u00B7 ' + removed + ' removed \u00B7 ' + (ops.length-added-removed) + ' unchanged';
  }
  leftEl.addEventListener('input', run);
  rightEl.addEventListener('input', run);
  document.getElementById('tdiff-sample').addEventListener('click', () => {
    leftEl.value = 'server.port=8080\nserver.host=localhost\ndebug=false\ntimeout=30';
    rightEl.value = 'server.port=9090\nserver.host=localhost\ndebug=true\ntimeout=30\nnewSetting=1';
    run();
  });
  document.getElementById('tdiff-clear').addEventListener('click', () => { leftEl.value=''; rightEl.value=''; run(); });
  run();
})();
