/* ==================================================================
   qr-tools.js — QR Generate & Decode
   Uses cdnjs 'qrcode' (soldair/node-qrcode) for generation and
   cdnjs 'html5-qrcode' (mebjas) scanFile() for decoding images.
   ================================================================== */
"use strict";

(function(){
  const textInput = document.getElementById('qrgen-text');
  if (!textInput) return;
  const canvas = document.getElementById('qrgen-canvas');
  const placeholder = document.getElementById('qrgen-placeholder');
  const errorBox = document.getElementById('qrgen-error');
  const downloadBtn = document.getElementById('qrgen-download');
  const sizeSelect = document.getElementById('qrgen-size');
  const eccSelect = document.getElementById('qrgen-ecc');
  const darkColor = document.getElementById('qrgen-dark');
  const lightColor = document.getElementById('qrgen-light');
  let lastDataUrl = null;

  function generate(){
    const text = textInput.value;
    errorBox.classList.remove('show');
    if (!text.trim()){
      canvas.style.display = 'none';
      placeholder.style.display = 'flex';
      downloadBtn.disabled = true;
      return;
    }
    if (typeof QRCode === 'undefined'){
      errorBox.textContent = 'QR library failed to load (needs an internet connection to fetch cdnjs.cloudflare.com).';
      errorBox.classList.add('show');
      return;
    }
    const opts = {
      errorCorrectionLevel: eccSelect.value,
      margin: 2,
      width: Number(sizeSelect.value),
      color: { dark: darkColor.value || '#000000', light: lightColor.value || '#ffffff' }
    };
    QRCode.toCanvas(canvas, text, opts, function(err){
      if (err){
        errorBox.textContent = 'Could not generate QR code: ' + err.message + (err.message && err.message.includes('too big') ? ' Try a lower error-correction level or shorter text.' : '');
        errorBox.classList.add('show');
        canvas.style.display = 'none';
        placeholder.style.display = 'flex';
        downloadBtn.disabled = true;
        return;
      }
      canvas.style.display = 'block';
      placeholder.style.display = 'none';
      downloadBtn.disabled = false;
      lastDataUrl = canvas.toDataURL('image/png');
    });
  }

  let debounceTimer;
  function debouncedGenerate(){
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(generate, 150);
  }

  textInput.addEventListener('input', debouncedGenerate);
  sizeSelect.addEventListener('change', generate);
  eccSelect.addEventListener('change', generate);
  darkColor.addEventListener('input', debouncedGenerate);
  lightColor.addEventListener('input', debouncedGenerate);

  document.querySelectorAll('.qrgen-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      // Presets fill the plain Content box, so force type back to "text"
      // first — otherwise the value would land in a hidden/wrong field.
      const typeSel = document.getElementById('qrgen-type');
      if (typeSel.value !== 'text'){
        typeSel.value = 'text';
        typeSel.dispatchEvent(new Event('change'));
      }
      textInput.value = btn.dataset.value;
      generate();
    });
  });

  downloadBtn.addEventListener('click', () => {
    if (lastDataUrl) downloadDataUrl('qrcode.png', lastDataUrl);
  });

  document.getElementById('qrgen-copy-img').addEventListener('click', async () => {
    if (!lastDataUrl) return;
    try{
      const blob = await (await fetch(lastDataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      flashButton('qrgen-copy-img', 'Copied!');
    } catch(e){
      flashButton('qrgen-copy-img', 'Copy not supported here');
    }
  });

  // QR "type" helper templates
  document.getElementById('qrgen-type').addEventListener('change', (e) => {
    const t = e.target.value;
    const tpl = document.getElementById('qrgen-template-fields');
    const contentWrap = document.getElementById('qrgen-content-wrap');
    tpl.innerHTML = '';
    if (t === 'text'){
      tpl.style.display = 'none';
      contentWrap.style.display = 'block';
      return;
    }
    // A structured type is selected: hide the generic Content box so there's
    // only one field driving the QR, and show the type-specific inputs.
    contentWrap.style.display = 'none';
    tpl.style.display = 'grid';
    const fieldsByType = {
      url: [{ id:'f-url', label:'URL', placeholder:'https://example.com' }],
      wifi: [
        { id:'f-ssid', label:'Network name (SSID)', placeholder:'MyWiFi' },
        { id:'f-pass', label:'Password', placeholder:'' },
        { id:'f-enc', label:'Encryption (WPA / WEP / nopass)', placeholder:'WPA' }
      ],
      email: [
        { id:'f-to', label:'To', placeholder:'someone@example.com' },
        { id:'f-subject', label:'Subject', placeholder:'' },
        { id:'f-body', label:'Body', placeholder:'' }
      ],
      tel: [{ id:'f-tel', label:'Phone number', placeholder:'+91 98765 43210' }],
      sms: [{ id:'f-smsnum', label:'Phone number', placeholder:'+91 98765 43210' }, { id:'f-smsbody', label:'Message', placeholder:'' }]
    };
    (fieldsByType[t]||[]).forEach(f => {
      const wrap = document.createElement('div');
      wrap.innerHTML = '<span class="field-label">' + escapeHtml(f.label) + '</span>';
      const inp = document.createElement('input');
      inp.className = 'field'; inp.id = f.id; inp.placeholder = f.placeholder || '';
      inp.style.width = '100%';
      inp.addEventListener('input', buildFromTemplate);
      wrap.appendChild(inp);
      tpl.appendChild(wrap);
    });
    buildFromTemplate();

    function buildFromTemplate(){
      const val = id => (document.getElementById(id) ? document.getElementById(id).value : '');
      let text = '';
      if (t === 'url') text = val('f-url');
      else if (t === 'wifi') text = `WIFI:T:${val('f-enc')||'WPA'};S:${val('f-ssid')};P:${val('f-pass')};;`;
      else if (t === 'email') text = `mailto:${val('f-to')}?subject=${encodeURIComponent(val('f-subject'))}&body=${encodeURIComponent(val('f-body'))}`;
      else if (t === 'tel') text = `tel:${val('f-tel')}`;
      else if (t === 'sms') text = `SMSTO:${val('f-smsnum')}:${val('f-smsbody')}`;
      textInput.value = text;
      generate();
    }
  });
})();

/* ================= QR DECODE ================= */
(function(){
  const dropzone = document.getElementById('qrdec-drop');
  if (!dropzone) return;
  const fileInput = document.getElementById('qrdec-file');
  const resultBox = document.getElementById('qrdec-result');
  const resultText = document.getElementById('qrdec-text');
  const errorBox = document.getElementById('qrdec-error');
  const imgPreview = document.getElementById('qrdec-img');
  const readerDiv = document.getElementById('qrdec-reader'); // required by html5-qrcode even for file scanning

  function openPicker(){ fileInput.click(); }
  dropzone.addEventListener('click', openPicker);
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; if (f) handleFile(f); fileInput.value=''; });
  ['dragenter','dragover'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag-over'); }));
  dropzone.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

  function handleFile(file){
    errorBox.classList.remove('show');
    resultBox.classList.remove('show');
    if (!file.type.startsWith('image/')){
      errorBox.textContent = 'That file doesn\u2019t look like an image.';
      errorBox.classList.add('show');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { imgPreview.src = reader.result; imgPreview.style.display = 'block'; };
    reader.readAsDataURL(file);

    if (typeof Html5Qrcode === 'undefined'){
      errorBox.textContent = 'QR decoder library failed to load (needs an internet connection to fetch cdnjs.cloudflare.com).';
      errorBox.classList.add('show');
      return;
    }
    try{
      const scanner = new Html5Qrcode(readerDiv.id);
      scanner.scanFile(file, false)
        .then(decodedText => {
          resultText.textContent = decodedText;
          resultBox.classList.add('show');
          renderDecodedActions(decodedText);
        })
        .catch(err => {
          // Surface the real reason instead of a canned message — this is
          // what actually tells us (and the browser console) what failed.
          const reason = (err && err.message) ? err.message : String(err);
          console.error('QR decode failed:', err);
          errorBox.textContent = 'Could not decode: ' + reason;
          errorBox.classList.add('show');
        })
        .finally(() => { try{ scanner.clear(); } catch(e){} });
    } catch(e){
      console.error('QR decoder threw synchronously:', e);
      errorBox.textContent = 'Decoder error: ' + e.message;
      errorBox.classList.add('show');
    }
  }

  function renderDecodedActions(text){
    const actions = document.getElementById('qrdec-actions');
    actions.innerHTML = '';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn subtle'; copyBtn.textContent = 'Copy text';
    copyBtn.addEventListener('click', () => copyToClipboard(text, copyBtn.id || null).then(()=>{ copyBtn.textContent='Copied!'; setTimeout(()=>copyBtn.textContent='Copy text',1200); }));
    actions.appendChild(copyBtn);
    if (/^https?:\/\//i.test(text)){
      const openBtn = document.createElement('a');
      openBtn.className = 'btn subtle'; openBtn.textContent = 'Open link \u2197';
      openBtn.href = text; openBtn.target = '_blank'; openBtn.rel = 'noopener noreferrer';
      actions.appendChild(openBtn);
    }
  }
})();
