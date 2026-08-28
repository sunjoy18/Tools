/* ==================================================================
   md-tools.js — Markdown preview + export to PDF / HTML / .md
   Depends on: core.js (formatBytes, byteLength, downloadText,
   wireCompactUpload, escapeHtml), and the marked + DOMPurify
   libraries loaded via cdnjs in tools.html.
   ================================================================== */
"use strict";

(function(){
  const input = document.getElementById('mdpdf-input');
  if (!input) return;
  const preview = document.getElementById('mdpdf-preview');
  const sizeMeta = document.getElementById('mdpdf-size');

  const SAMPLE = `# Fleet Handover Note

**Fleet:** FL-2026-041 \u00B7 **Operator:** Aequitous Transit

## Summary

- Driver **Ramesh Kulkarni** (ID \`D-1029\`) completed handover on schedule.
- Both vehicles serviced within the last 30 days.
- No pending maintenance flags.

## Vehicles

| Reg No | Type | Capacity | Last Service (km) |
|---|---|---|---|
| MH-12-AB-1234 | Bus | 42 | 118,240 |
| MH-12-CD-5678 | Truck | 12,000 | 92,310 |

## Notes

> Route Pune\u2013Mumbai had a 15 min delay on 2026-01-15 due to toll congestion. No further action needed.

Routes covered this week: Pune-Mumbai, Pune-Nashik.

---

*Generated from the Tools suite \u2014 Markdown \u2192 PDF.*
`;

  function render(){
    const text = input.value;
    sizeMeta.textContent = formatBytes(byteLength(text));
    if (!text.trim()){
      preview.innerHTML = '<p style="color:#8a94a3;">Nothing to preview yet.</p>';
      return;
    }
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined'){
      preview.innerHTML = '<p style="color:#c0392b;">Markdown renderer failed to load (needs an internet connection to fetch cdnjs.cloudflare.com).</p>';
      return;
    }
    const rawHtml = marked.parse(text, { gfm: true, breaks: false });
    preview.innerHTML = DOMPurify.sanitize(rawHtml);
  }

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 120);
  });

  const upload = wireCompactUpload({
    cardEl: input.closest('.card'),
    fileInputEl: document.getElementById('mdpdf-file'),
    uploadBtnEl: document.getElementById('mdpdf-filebtn'),
    textareaEl: input,
    onText: (text) => { input.value = text; render(); }
  });

  document.getElementById('mdpdf-sample').addEventListener('click', () => {
    input.value = SAMPLE;
    render();
  });
  document.getElementById('mdpdf-clear').addEventListener('click', () => {
    input.value = '';
    render();
  });

  document.getElementById('mdpdf-download-md').addEventListener('click', () => {
    if (!input.value.trim()) return;
    downloadText('document.md', input.value, 'text/markdown');
  });
  document.getElementById('mdpdf-download-html').addEventListener('click', () => {
    if (!input.value.trim()) return;
    const style = `
      body{ margin:0; background:#fff; }
      .doc{ max-width:800px; margin:40px auto; padding:0 20px; font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; line-height:1.65; color:#1a1f28; font-size:15px; }
      h1,h2,h3,h4{ margin:1.2em 0 .5em 0; line-height:1.3; color:#0d1117; }
      h1{ font-size:1.9em; border-bottom:1px solid #e2e5e9; padding-bottom:.3em; }
      h2{ font-size:1.5em; border-bottom:1px solid #e2e5e9; padding-bottom:.25em; }
      h3{ font-size:1.2em; }
      p{ margin:.7em 0; }
      a{ color:#1a6fd6; }
      code{ background:#f1f3f5; padding:.15em .4em; border-radius:4px; font-family:ui-monospace,Consolas,monospace; font-size:.9em; }
      pre{ background:#f6f8fa; border:1px solid #e2e5e9; border-radius:8px; padding:14px; overflow:auto; }
      pre code{ background:none; padding:0; }
      blockquote{ border-left:3px solid #d0d7de; margin:1em 0; padding:.2em 1em; color:#57606a; }
      table{ border-collapse:collapse; margin:1em 0; width:100%; }
      th,td{ border:1px solid #d0d7de; padding:6px 10px; text-align:left; }
      th{ background:#f6f8fa; }
      img{ max-width:100%; }
    `;
    const standalone = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>Document</title><style>' + style + '</style></head>' +
      '<body><div class="doc">' + preview.innerHTML + '</div></body></html>';
    downloadText('document.html', standalone, 'text/html');
  });
  document.getElementById('mdpdf-download-pdf').addEventListener('click', () => {
    if (!input.value.trim()) return;
    window.print();
  });

  render();
})();
