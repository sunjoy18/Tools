"use strict";
/* ================= UNIT CONVERTER ================= */
(function(){
  const groupSel = document.getElementById('unit-group');
  if (!groupSel) return;
  const fromSel = document.getElementById('unit-from');
  const toSel = document.getElementById('unit-to');
  const fromInput = document.getElementById('unit-from-val');
  const toInput = document.getElementById('unit-to-val');
  const swapBtn = document.getElementById('unit-swap');

  const GROUPS = {
    length: { units:{ m:1, km:1000, cm:0.01, mm:0.001, mi:1609.344, yd:0.9144, ft:0.3048, in:0.0254, nmi:1852 } },
    weight: { units:{ kg:1, g:0.001, mg:0.000001, t:1000, lb:0.45359237, oz:0.028349523125, st:6.35029318 } },
    data: { units:{ B:1, KB:1024, MB:1024**2, GB:1024**3, TB:1024**4, bit:0.125, Kb:128, Mb:131072 } },
    speed: { units:{ 'm/s':1, 'km/h':1/3.6, mph:0.44704, knot:0.514444, 'ft/s':0.3048 } },
    area: { units:{ m2:1, km2:1e6, ha:10000, ft2:0.09290304, acre:4046.8564224, mi2:2589988.110336 } },
    volume: { units:{ L:1, mL:0.001, m3:1000, gal:3.785411784, qt:0.946352946, pt:0.473176473, cup:0.2365882365 } },
    temperature: { special: true }
  };

  function populateUnits(){
    const g = GROUPS[groupSel.value];
    fromSel.innerHTML = ''; toSel.innerHTML = '';
    const keys = g.special ? ['C','F','K'] : Object.keys(g.units);
    keys.forEach(k => {
      fromSel.appendChild(new Option(k, k));
      toSel.appendChild(new Option(k, k));
    });
    toSel.selectedIndex = Math.min(1, keys.length-1);
    convert('from');
  }

  function tempConvert(value, from, to){
    let c;
    if (from==='C') c = value; else if (from==='F') c = (value-32)*5/9; else c = value-273.15;
    if (to==='C') return c; if (to==='F') return c*9/5+32; return c+273.15;
  }

  function convert(direction){
    const g = GROUPS[groupSel.value];
    const from = fromSel.value, to = toSel.value;
    if (direction === 'from'){
      const v = parseFloat(fromInput.value);
      if (isNaN(v)){ toInput.value = ''; return; }
      const result = g.special ? tempConvert(v, from, to) : v * g.units[from] / g.units[to];
      toInput.value = formatNum(result);
    } else {
      const v = parseFloat(toInput.value);
      if (isNaN(v)){ fromInput.value = ''; return; }
      const result = g.special ? tempConvert(v, to, from) : v * g.units[to] / g.units[from];
      fromInput.value = formatNum(result);
    }
  }
  function formatNum(n){
    if (Math.abs(n) >= 1e9 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(4);
    return (Math.round(n * 1e8) / 1e8).toString();
  }

  groupSel.addEventListener('change', populateUnits);
  fromSel.addEventListener('change', () => convert('from'));
  toSel.addEventListener('change', () => convert('from'));
  fromInput.addEventListener('input', () => convert('from'));
  toInput.addEventListener('input', () => convert('to'));
  swapBtn.addEventListener('click', () => {
    const tmpUnit = fromSel.value; fromSel.value = toSel.value; toSel.value = tmpUnit;
    convert('from');
  });

  populateUnits();
  fromInput.value = '1';
  convert('from');
})();

/* ================= CURRENCY CONVERTER ================= */
(function(){
  const amountInput = document.getElementById('cur-amount');
  if (!amountInput) return;
  const fromSel = document.getElementById('cur-from');
  const toSel = document.getElementById('cur-to');
  const resultEl = document.getElementById('cur-result');
  const statusEl = document.getElementById('cur-status');
  const swapBtn = document.getElementById('cur-swap');

  // Offline fallback table (approximate reference rates, roughly early-2026 vintage) — used only if the live API is unreachable.
  const FALLBACK_RATES_USD = {
    USD:1, EUR:0.92, GBP:0.79, INR:87.5, JPY:150, AUD:1.53, CAD:1.37, CHF:0.88,
    CNY:7.15, SGD:1.34, AED:3.67, SAR:3.75, ZAR:18.2, BRL:5.4, MXN:18.6, NZD:1.66
  };
  const CODES = Object.keys(FALLBACK_RATES_USD);

  let rates = null; // { base: 'USD', rates: {...}, live: bool, date: '' }

  function populateCurrencies(){
    CODES.forEach(c => { fromSel.appendChild(new Option(c, c)); toSel.appendChild(new Option(c, c)); });
    fromSel.value = 'USD'; toSel.value = 'INR';
  }

  async function loadRates(base){
    statusEl.textContent = 'Fetching live rates\u2026';
    try{
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch('https://api.frankfurter.app/latest?from=' + base, { signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      rates = { base, rates: Object.assign({ [base]: 1 }, data.rates), live: true, date: data.date };
      statusEl.textContent = 'Live rates as of ' + data.date + ' (frankfurter.app / ECB reference rates)';
    } catch(e){
      // fallback: derive from static USD table
      const usdRates = FALLBACK_RATES_USD;
      const baseToUsd = 1 / usdRates[base];
      const derived = {};
      CODES.forEach(c => derived[c] = usdRates[c] * baseToUsd);
      rates = { base, rates: derived, live: false };
      statusEl.textContent = '\u26A0\uFE0F Live rates unavailable — using approximate offline reference rates. Do not use for actual transactions.';
    }
  }

  async function convert(){
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount)){ resultEl.textContent = '—'; return; }
    if (!rates || rates.base !== fromSel.value) await loadRates(fromSel.value);
    const rate = rates.rates[toSel.value];
    if (rate === undefined){ resultEl.textContent = 'No rate available'; return; }
    resultEl.textContent = (amount * rate).toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  amountInput.addEventListener('input', convert);
  fromSel.addEventListener('change', convert);
  toSel.addEventListener('change', convert);
  swapBtn.addEventListener('click', () => { const t=fromSel.value; fromSel.value=toSel.value; toSel.value=t; convert(); });

  populateCurrencies();
  amountInput.value = '1';
  convert();
})();

/* ================= TIME / TIMEZONE CONVERTER ================= */
(function(){
  const dtInput = document.getElementById('tz-datetime');
  if (!dtInput) return;
  const sourceZoneSel = document.getElementById('tz-source');
  const addZoneSel = document.getElementById('tz-add');
  const addZoneBtn = document.getElementById('tz-add-btn');
  const cardsWrap = document.getElementById('tz-cards');
  const unixInput = document.getElementById('tz-unix');
  const nowBtn = document.getElementById('tz-now');
  const pasteInput = document.getElementById('tz-paste');
  const pasteError = document.getElementById('tz-paste-error');

  const COMMON_ZONES = [
    'UTC','Asia/Kolkata','America/New_York','America/Los_Angeles','America/Chicago',
    'Europe/London','Europe/Berlin','Europe/Paris','Asia/Tokyo','Asia/Shanghai',
    'Asia/Singapore','Asia/Dubai','Australia/Sydney','Pacific/Auckland','Asia/Karachi'
  ];
  // Default focus: UTC -> IST, with a couple of other common zones on hand.
  let activeZones = ['Asia/Kolkata','UTC','America/New_York'];

  // When the paste field holds a valid, parsed instant, it takes priority
  // over the manual date/timezone/unix fields (which become secondary).
  let pastedInstant = null;

  function populateZoneSelects(){
    [sourceZoneSel, addZoneSel].forEach(sel => {
      sel.innerHTML = '';
      COMMON_ZONES.forEach(z => sel.appendChild(new Option(z, z)));
    });
    sourceZoneSel.value = 'UTC';
  }

  function showPasteError(msg){
    pasteError.textContent = msg;
    pasteError.classList.toggle('show', !!msg);
    pasteInput.style.borderColor = msg ? 'rgba(240,96,90,0.6)' : '';
  }

  // Accepts ISO 8601 ("2026-08-08T05:49:45.000Z"), "YYYY-MM-DD HH:MM:SS",
  // RFC 2822, and raw epoch seconds/milliseconds.
  function parsePasted(raw){
    const str = (raw || '').trim();
    if (!str) return null;
    if (/^-?\d+$/.test(str)){
      const n = parseInt(str, 10);
      const ms = Math.abs(n) > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    d = new Date(str.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  function formatInZone(date, timeZone){
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, weekday:'short' });
    const parts = {};
    fmt.formatToParts(date).forEach(p => parts[p.type] = p.value);
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}`, weekday: parts.weekday };
  }
  function offsetString(date, timeZone){
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName:'shortOffset' });
    const part = fmt.formatToParts(date).find(p => p.type === 'timeZoneName');
    return part ? part.value.replace('GMT','UTC') : '';
  }

  function getSourceDate(){
    if (!dtInput.value) return new Date();
    // dtInput.value is "YYYY-MM-DDTHH:MM" interpreted as wall-clock time IN sourceZoneSel.value.
    // We compute the UTC instant by finding the offset of that zone at roughly that time.
    const naive = new Date(dtInput.value + ':00Z'); // treat as if UTC first, to get an approx instant for offset lookup
    const off = offsetString(naive, sourceZoneSel.value); // e.g. "UTC+5:30"
    const m = off.match(/UTC([+-])(\d+)(?::(\d+))?/);
    let offsetMinutes = 0;
    if (m){ offsetMinutes = (m[1]==='-'?-1:1) * (parseInt(m[2])*60 + (m[3]?parseInt(m[3]):0)); }
    return new Date(naive.getTime() - offsetMinutes*60000);
  }

  function getInstant(){
    return pastedInstant || getSourceDate();
  }

  function render(){
    const instant = getInstant();
    unixInput.value = Math.floor(instant.getTime()/1000);
    cardsWrap.innerHTML = '';
    activeZones.forEach(zone => {
      const { date, time, weekday } = formatInZone(instant, zone);
      const off = offsetString(instant, zone);
      const card = document.createElement('div');
      card.className = 'tz-card';
      card.innerHTML = `<button class="remove-zone" title="Remove">\u2715</button><div class="zone">${escapeHtml(zone)}</div>
        <div class="time">${time}</div><div class="date">${weekday}, ${date} \u00B7 ${off}</div>`;
      card.querySelector('.remove-zone').addEventListener('click', () => {
        activeZones = activeZones.filter(z => z !== zone);
        render();
      });
      cardsWrap.appendChild(card);
    });
  }

  // --- Primary: paste field ---
  pasteInput.addEventListener('input', () => {
    const val = pasteInput.value;
    if (!val.trim()){
      pastedInstant = null;
      showPasteError('');
      render();
      return;
    }
    const d = parsePasted(val);
    if (d){
      pastedInstant = d;
      showPasteError('');
      // Keep the manual fields in sync (as UTC) so they stay useful as a fallback.
      const utcLocal = formatInZone(d, 'UTC');
      sourceZoneSel.value = 'UTC';
      dtInput.value = utcLocal.date + 'T' + utcLocal.time.slice(0,5);
      render();
    } else {
      showPasteError('Couldn\u2019t parse that \u2014 try an ISO format like 2026-08-08T05:49:45.000Z, or a Unix timestamp.');
    }
  });

  // --- Secondary: manual date/timezone/unix fields ---
  // Editing any of these clears the pasted value so manual entry takes over.
  dtInput.addEventListener('input', () => { pastedInstant = null; pasteInput.value = ''; showPasteError(''); render(); });
  sourceZoneSel.addEventListener('change', () => { pastedInstant = null; pasteInput.value = ''; showPasteError(''); render(); });
  addZoneBtn.addEventListener('click', () => {
    const z = addZoneSel.value;
    if (!activeZones.includes(z)) activeZones.push(z);
    render();
  });
  unixInput.addEventListener('change', () => {
    const sec = parseInt(unixInput.value);
    if (isNaN(sec)) return;
    const d = new Date(sec*1000);
    const local = formatInZone(d, sourceZoneSel.value);
    dtInput.value = local.date + 'T' + local.time.slice(0,5);
    pastedInstant = null;
    pasteInput.value = '';
    showPasteError('');
    render();
  });
  nowBtn.addEventListener('click', () => {
    const now = new Date();
    const local = formatInZone(now, sourceZoneSel.value);
    dtInput.value = local.date + 'T' + local.time.slice(0,5);
    pastedInstant = null;
    pasteInput.value = '';
    showPasteError('');
    render();
  });

  populateZoneSelects();
  const now = new Date();
  const localNow = formatInZone(now, 'UTC');
  dtInput.value = localNow.date + 'T' + localNow.time.slice(0,5);
  render();
})();
