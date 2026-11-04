'use strict';
/* AV Inventory Pro v2 — offline-first equipment management for AV departments.
   Built on the original single-file prototype; adds SKUs & serials, quantity
   checkout, service/maintenance tracking, printable Code 39 asset labels,
   CSV export and JSON backup/restore. Zero dependencies, runs from file://. */

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const today = () => day(0);
const money = n => '$' + Math.round(n).toLocaleString();

/* ---------- state, storage & migration ---------- */
const KEY = 'avinv-pro-1'; // same key as v1: existing localStorage data upgrades in place
let S, view = 'dash', tab = 'active', q = '', fc = '', fl = '', fst = '', curId = '', fr = '';
let sort = { k: 'n', dir: 1 };

function nextSku(used) {
  let n = 1;
  while (used.has('AV-' + String(n).padStart(4, '0'))) n++;
  const s = 'AV-' + String(n).padStart(4, '0');
  used.add(s);
  return s;
}

/* Upgrade older/partial state to the v2 shape. Idempotent. */
function migrate(s) {
  s.ver = s.ver || 2;
  s.log ??= [];
  s.svc ??= [];
  if (!s.rooms || !s.inst) { const d = seedInst(); s.rooms = d.rooms; s.inst = d.inst; }
  const used = new Set((s.items || []).map(i => i.sku).filter(Boolean));
  (s.items || []).forEach(i => {
    if (!i.sku) i.sku = nextSku(used);
    i.serials ??= ''; i.supplier ??= ''; i.purchased ??= ''; i.nextsvc ??= ''; i.notes ??= '';
  });
  (s.co || []).forEach(c => { c.qty = c.qty || 1; c.type ??= 'returnable'; c.mvt ??= ''; c.reason ??= ''; c.dest ??= ''; c.appr = normAppr(c.appr); });
  (s.people || []).forEach(p => { p.contact ??= ''; });
  return s;
}

function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } ghAuto(); }
function log(m) { S.log.unshift({ t: Date.now(), m }); S.log = S.log.slice(0, 200); }
const nm = (a, id) => (S[a].find(x => x.id == id) || { n: '—' }).n;

/* ---------- first-run state & demo data ---------- */
/* First run starts EMPTY — load your real stock via Data & Backup → Restore backup,
   or let GitHub sync pull it. demoSeed() provides an optional sample set. */
function seed() {
  return { ver: 2, items: [], cats: [{ id: uid(), n: 'General' }], locs: [{ id: uid(), n: 'AV Store' }], people: [], co: [], svc: [], rooms: [], inst: [], log: [{ t: Date.now(), m: 'Welcome — add an item, restore a backup, or load the demo data' }] };
}
function demoSeed() {
  const cats = ['Cameras', 'Audio', 'Lighting', 'Projection', 'Cables', 'Computing', 'Support'].map(n => ({ id: uid(), n }));
  const locs = ['Media Studio', 'Main Auditorium', 'Control Room', 'Storage Cage'].map(n => ({ id: uid(), n }));
  const people = [
    ['Amara Okello', 'amara@avdept.example'], ['Daniel Mugisha', 'daniel@avdept.example'],
    ['Grace Nakato', 'grace@avdept.example'], ['Brian Ssemwogerere', 'brian@avdept.example'],
    ['Lydia Achieng', 'lydia@avdept.example']
  ].map(([n, c]) => ({ id: uid(), n, contact: c }));
  const c = n => cats.find(x => x.n == n).id, l = n => locs.find(x => x.n == n).id;
  /* name|category|location|qty|min|price|supplier|purchased|serials */
  const raw = `Sony FX3 Cinema Camera|Cameras|Media Studio|2|1|3900|Sony Pro|2023-01-12|FX3-22081147, FX3-22081148
Sony A7 IV|Cameras|Media Studio|2|1|2500|Sony Pro|2023-01-12|A7IV-33019455, A7IV-33019456
Canon C70|Cameras|Media Studio|1|1|5500|CPC Cameras|2022-06-03|C70-11802241
Sony 24-70mm GM Lens|Cameras|Storage Cage|3|1|2200|Sony Pro|2023-02-02|SEL2470GM-101, SEL2470GM-102, SEL2470GM-103
Shure SLXD24 Wireless Mic|Audio|Main Auditorium|6|2|650|Full Compass|2023-05-18|SLXD24-K51 to K56
Shure SM58 Handheld|Audio|Main Auditorium|8|3|99|Full Compass|2021-09-30|
Rode NTG3 Shotgun Mic|Audio|Media Studio|3|1|700|B&H Photo|2022-11-14|NTG3-8841, NTG3-8842
Sennheiser HD280 Headphones|Audio|Control Room|6|2|100|B&H Photo|2022-04-08|
JBL EON715 Speaker|Audio|Main Auditorium|4|2|550|Full Compass|2023-05-18|EON715-4471, EON715-4472
Yamaha MG16XU Mixer|Audio|Control Room|2|1|600|Yamaha Music|2021-07-22|
Behringer X32 Digital Mixer|Audio|Control Room|1|1|2500|Full Compass|2022-03-05|X32-21-0455
Epson Pro EX11000 Projector|Projection|Main Auditorium|3|1|1500|Epson Store|2023-08-19|
Epson L610U Laser Projector|Projection|Storage Cage|2|1|3200|Epson Store|2023-08-19|L610U-99301, L610U-99302
Projector Screen 120in|Projection|Storage Cage|4|1|240|Elite Screens|2022-05-25|
Aputure 300D II LED Light|Lighting|Media Studio|3|1|900|B&H Photo|2023-02-20|300DII-5506, 300DII-5507
Godox SL60W Panel|Lighting|Media Studio|5|2|150|Godox Direct|2023-02-20|
Elation Par Can LED|Lighting|Main Auditorium|12|4|180|Elation Pro|2021-12-11|
Neewer Softbox Kit|Lighting|Media Studio|2|1|120|Amazon|2023-04-01|
HDMI 15ft Cable|Cables|Storage Cage|3|5|12|Local supplier|2024-01-10|
XLR 25ft Cable|Cables|Storage Cage|14|6|18|Full Compass|2024-01-10|
SDI 50ft Cable|Cables|Storage Cage|8|3|35|B&H Photo|2024-01-10|
Power Strip 6-outlet|Cables|Storage Cage|9|4|15|Local supplier|2024-01-10|
Manfrotto 504X Tripod|Support|Media Studio|4|2|600|Manfrotto|2022-08-30|504X-2210, 504X-2211
Tripod Dolly|Support|Media Studio|2|1|130|Manfrotto|2022-08-30|
C-Stand with Arm|Support|Main Auditorium|6|2|110|Local supplier|2021-10-05|
Mic Stand Boom|Support|Main Auditorium|10|4|35|Full Compass|2021-10-05|
MacBook Pro 16in Edit Laptop|Computing|Media Studio|2|1|2800|Apple Store|2023-06-15|C02X1234JKGH, C02X1235JKGH
Blackmagic ATEM Mini Pro|Computing|Control Room|2|1|300|Blackmagic|2023-01-20|ATEMMP-7741
SanDisk 1TB SSD|Computing|Media Studio|6|3|110|Amazon|2024-02-11|`;
  let skun = 0;
  const items = raw.split('\n').map(r => {
    const p = r.split('|');
    return { id: uid(), sku: 'AV-' + String(++skun).padStart(4, '0'), n: p[0], cat: c(p[1]), loc: l(p[2]), qty: +p[3], min: +p[4], price: +p[5], supplier: p[6], purchased: p[7], serials: p[8] || '', nextsvc: '', notes: '' };
  });
  /* a few items carry a next-service date so the dashboard widget demos itself */
  const svcDueSeed = { 'Sony FX3 Cinema Camera': day(-12), 'Aputure 300D II LED Light': day(9), 'Epson L610U Laser Projector': day(26) };
  items.forEach(i => { i.nextsvc = svcDueSeed[i.n] || ''; });
  const co = [
    { id: uid(), mvt: 'MV-0001', type: 'returnable', item: items[0].id, who: people[0].id, qty: 1, out: day(-9), due: day(-2), back: null, reason: 'Client shoot — Kampala', dest: '' },
    { id: uid(), mvt: 'MV-0002', type: 'returnable', item: items[4].id, who: people[1].id, qty: 2, out: day(-1), due: day(5), back: null, reason: 'Sunday service setup', dest: '' }
  ];
  const svc = [
    { id: uid(), item: items[8].id, date: day(-40), what: 'Firmware update and connector check', by: 'Daniel M.', cost: 0 },
    { id: uid(), item: items[2].id, date: day(-75), what: 'Sensor cleaning and full inspection', by: 'Amara O.', cost: 60 }
  ];
  const d = seedInst();
  return { ver: 2, items, cats, locs, people, co, svc, rooms: d.rooms, inst: d.inst, log: [{ t: Date.now(), m: 'Demo data loaded' }] };
}

function seedInst() {
  const rooms = ['Board Room', 'Conference Room A', 'Conference Room B', 'Training Room'].map(n => ({ id: uid(), n }));
  const r = n => rooms.find(x => x.n == n).id;
  const raw = `75in Wall Display|Board Room|Display|Samsung QM75B|Working|2023-03-10
Ceiling Mic Array|Board Room|Audio|Shure MXA910|Working|2023-03-10
Video Conferencing Bar|Board Room|Video Conferencing|Poly Studio X70|Working|2023-03-12
Touch Panel Controller|Board Room|Control|Crestron TSW-770|Working|2023-03-12
Ceiling Speakers (x4)|Board Room|Audio|JBL Control 26CT|Working|2023-03-10
DSP Processor|Board Room|Audio|Biamp Tesira Forte|Working|2023-03-11
65in Wall Display|Conference Room A|Display|LG 65UR640S|Working|2022-08-02
Video Bar|Conference Room A|Video Conferencing|Logitech Rally Bar|Needs service|2022-08-02
Wireless Presentation|Conference Room A|Control|Barco ClickShare CX-30|Working|2022-08-05
Laser Projector|Conference Room B|Projection|Epson EB-L630U|Working|2021-11-20
Motorized Screen 110in|Conference Room B|Projection|Elite Screens Spectrum|Working|2021-11-20
Wall Plate HDMI/USB-C|Conference Room B|Network|Extron HDMI Pass-Thru|Offline|2021-11-22
PTZ Camera|Training Room|Video Conferencing|Sony SRG-A40|Working|2024-01-15
Wireless Lectern Mic|Training Room|Audio|Shure QLXD4|Working|2024-01-15
55in Confidence Monitor|Training Room|Display|Samsung QB55B|Working|2024-01-16`;
  const inst = raw.split('\n').map(ll => { const p = ll.split('|'); return { id: uid(), n: p[0], room: r(p[1]), type: p[2], sn: p[3], st: p[4], date: p[5], note: '' }; });
  return { rooms, inst };
}

/* ---------- availability & status ---------- */
const act = i => S.co.filter(c => c.item == i.id && !c.back).reduce((a, c) => a + (c.qty || 1), 0);
const avail = i => i.qty - act(i);
const status = i => avail(i) <= 0 ? ['Out of stock', 'er'] : avail(i) <= i.min ? ['Low', 'wn'] : ['In stock', 'ok'];
const overdue = c => !c.back && c.due < day(0);
const late = c => Math.round((new Date(day(0)) - new Date(c.due)) / 864e5);
const svcDue = i => !!i.nextsvc && i.nextsvc <= day(30);

/* ---------- theme ---------- */
const theme = () => localStorage.getItem(KEY + '-theme') || 'auto';
function applyTheme() {
  const t = theme();
  if (t == 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const b = $('#themeBtn');
  if (b) b.textContent = 'Theme: ' + t;
}
function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  localStorage.setItem(KEY + '-theme', order[(order.indexOf(theme()) + 1) % 3]);
  applyTheme();
}

/* ---------- nav & render ---------- */
const NAV = [['dash', 'Dashboard'], ['inv', 'Equipment'], ['co', 'Movements'], ['svc', 'Service'], ['inst', 'Room Installs'], ['rpt', 'Reports'], ['cats', 'Categories'], ['locs', 'Locations'], ['people', 'People'], ['log', 'Activity Log'], ['data', 'Data & Backup']];
function go(v) { view = v; curId = ''; nav.classList.remove('open'); render(); }
function openItem(id) { curId = id; view = 'item'; render(); }
function backInv() { view = 'inv'; curId = ''; render(); }
function render() {
  $('#nav').innerHTML = '<h1>AV Inventory Pro<small>Audio Visual Dept.</small></h1>'
    + NAV.map(([k, t]) => `<a class="${k == view || (view == 'item' && k == 'inv') ? 'on' : ''}" onclick="go('${k}')">${t}</a>`).join('')
    + `<div class="navfoot"><button class="s" id="themeBtn" onclick="cycleTheme()"></button></div>`;
  applyTheme();
  $('#v').innerHTML = ({ dash, inv, item: itemDetail, co, svc: svcView, inst, rpt, cats: () => simple('cats', 'Categories', 'items', 'cat'), locs: () => simple('locs', 'Locations', 'items', 'loc'), people: () => simple('people', 'People', 'co', 'who'), log: logv, data: datav }[view] || dash)();
  save();
}

/* ---------- dashboard ---------- */
function dash() {
  const val = S.items.reduce((a, i) => a + i.qty * i.price, 0), units = S.items.reduce((a, i) => a + i.qty, 0);
  const low = S.items.filter(i => status(i)[1] != 'ok'), od = S.co.filter(overdue);
  const sd = S.items.filter(svcDue).length, soon = S.co.filter(c => !c.back && c.due >= day(0) && c.due <= day(3)).length;
  const bc = S.cats.map(c => [c.n, S.items.filter(i => i.cat == c.id).reduce((a, i) => a + i.qty * i.price, 0)]).sort((a, b) => b[1] - a[1]), mx = Math.max(...bc.map(x => x[1]), 1);
  const st = { ok: 0, wn: 0, er: 0 }; S.items.forEach(i => st[status(i)[1]]++);
  const tot = S.items.length || 1, C = 2 * Math.PI * 40; let off = 0;
  const arcs = [['ok', 'In stock'], ['wn', 'Low'], ['er', 'Out']].map(([k]) => { const len = C * st[k] / tot, s = `<circle r="40" cx="60" cy="60" fill="none" stroke="var(--${k})" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; return s; }).join('');
  return `<h2>Dashboard</h2><div class="grid">
  <div class="card"><h3>Stock value</h3><div class="big">${money(val)}</div></div>
  <div class="card"><h3>Items / units</h3><div class="big">${S.items.length} / ${units}</div></div>
  <div class="card"><h3>Checked out</h3><div class="big">${S.co.filter(c => !c.back).length}</div><div class="mu" style="font-size:12px">${soon} due within 3 days</div></div>
  <div class="card"><h3>Overdue</h3><div class="big ${od.length ? 'er' : ''}">${od.length}</div></div>
  <div class="card"><h3>Service due (30d)</h3><div class="big ${sd ? 'wn' : ''}">${sd}</div></div>
  <div class="card"><h3>Room installs needing attention</h3><div class="big ${S.inst.some(x => x.st != 'Working') ? 'wn' : ''}">${S.inst.filter(x => x.st != 'Working').length} <span class="mu" style="font-size:14px">of ${S.inst.length}</span></div></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
  <div class="card"><h3>Value by category</h3>${bc.map(([n, v]) => `<div class="bar"><span>${esc(n)}</span><i style="width:${v / mx * 60}%"></i><span>${money(v)}</span></div>`).join('')}</div>
  <div class="card"><h3>Status</h3><div class="row"><svg width="120" height="120" viewBox="0 0 120 120">${arcs}</svg><div><div class="ok">● In stock ${st.ok}</div><div class="wn">● Low ${st.wn}</div><div class="er">● Out ${st.er}</div></div></div></div>
  <div class="card"><h3>Low-stock alerts</h3>${low.length ? low.map(i => `<div>${esc(i.n)} <span class="mu">— ${avail(i)} of ${i.qty} available</span></div>`).join('') : '<span class="mu">All stocked</span>'}</div>
  <div class="card"><h3>Recent activity</h3><ul class="log">${S.log.slice(0, 6).map(l => `<li>${esc(l.m)} <span class="mu">${new Date(l.t).toLocaleString()}</span></li>`).join('')}</ul></div></div>`;
}

/* ---------- equipment ---------- */
const ar = k => sort.k == k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '';
function setSort(k) { if (sort.k === k) sort.dir *= -1; else sort = { k, dir: 1 }; render(); }
function invRows() {
  let rows = S.items.filter(i => {
    const hay = (i.n + ' ' + i.sku + ' ' + (i.serials || '') + ' ' + (i.supplier || '') + ' ' + (i.notes || '')).toLowerCase();
    return (!q || hay.includes(q)) && (!fc || i.cat == fc) && (!fl || i.loc == fl) && (!fst || (fst == 'svc' ? svcDue(i) : status(i)[1] == fst));
  });
  const key = { n: x => x.n.toLowerCase(), sku: x => x.sku, cat: x => nm('cats', x.cat), loc: x => nm('locs', x.loc), avail: x => avail(x), price: x => x.price }[sort.k];
  return rows.slice().sort((a, b) => { const va = key(a), vb = key(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
}
function inv() {
  const rows = invRows();
  const opt = (a, v) => S[a].map(x => `<option value="${x.id}" ${x.id == v ? 'selected' : ''}>${esc(x.n)}</option>`).join('');
  return `<h2>Equipment Inventory</h2><div class="row"><input placeholder="Search name, SKU, serial…" value="${esc(q)}" oninput="q=this.value.toLowerCase();render();const e=$('#v input');e.focus();e.setSelectionRange(99,99)">
  <select onchange="fc=this.value;render()"><option value="">All categories</option>${opt('cats', fc)}</select>
  <select onchange="fl=this.value;render()"><option value="">All locations</option>${opt('locs', fl)}</select>
  <select onchange="fst=this.value;render()"><option value="">All statuses</option><option value="ok" ${fst == 'ok' ? 'selected' : ''}>In stock</option><option value="wn" ${fst == 'wn' ? 'selected' : ''}>Low</option><option value="er" ${fst == 'er' ? 'selected' : ''}>Out of stock</option><option value="svc" ${fst == 'svc' ? 'selected' : ''}>Service due</option></select>
  <button class="p" onclick="itemForm()">+ Add item</button><button onclick="invExp()">Export…</button></div>
  <div class="card tw"><table><tr><th class="sortable" onclick="setSort('sku')">SKU${ar('sku')}</th><th class="sortable" onclick="setSort('n')">Item${ar('n')}</th><th class="sortable" onclick="setSort('cat')">Category${ar('cat')}</th><th class="sortable" onclick="setSort('loc')">Location${ar('loc')}</th><th class="sortable" onclick="setSort('avail')">Avail / Total${ar('avail')}</th><th class="sortable" onclick="setSort('price')">Unit price${ar('price')}</th><th>Status</th><th></th></tr>
  ${rows.map(i => { const s = status(i); return `<tr><td><code>${esc(i.sku)}</code></td><td><a class="lnk" onclick="openItem('${i.id}')" title="Open item detail">${esc(i.n)}</a></td><td>${esc(nm('cats', i.cat))}</td><td>${esc(nm('locs', i.loc))}</td><td>${avail(i)} / ${i.qty}</td><td>${money(i.price)}</td><td><span class="tag ${s[1]}">${s[0]}</span>${svcDue(i) ? ' <span class="tag wn">Service</span>' : ''}</td><td><button class="s" onclick="itemForm('${i.id}')">Edit</button> <button class="s d" onclick="delItem('${i.id}')">Delete</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="mu">No items</td></tr>'}</table></div>`;
}
function invExp() { expDlg('Equipment', ['SKU', 'Item', 'Category', 'Location', 'Qty', 'Available', 'Min', 'Unit price', 'Stock value', 'Supplier', 'Purchased', 'Next service', 'Serials', 'Notes'], invRows().map(i => [i.sku, i.n, nm('cats', i.cat), nm('locs', i.loc), i.qty, avail(i), i.min, i.price, i.qty * i.price, i.supplier, i.purchased, i.nextsvc, i.serials, i.notes])); }

/* ---------- item detail ---------- */
function itemDetail() {
  const i = S.items.find(x => x.id == curId);
  if (!i) return inv();
  const hist = S.co.filter(c => c.item == i.id).sort((a, b) => (b.out + (b.back || '')).localeCompare(a.out + (a.back || ''))).slice(0, 15);
  const svh = S.svc.filter(s => s.item == i.id).sort((a, b) => b.date.localeCompare(a.date));
  const s = status(i);
  const svcTag = i.nextsvc ? (i.nextsvc < day(0) ? `<span class="tag er">${esc(i.nextsvc)} — overdue</span>` : svcDue(i) ? `<span class="tag wn">${esc(i.nextsvc)} — due soon</span>` : esc(i.nextsvc)) : '<span class="mu">—</span>';
  return `<div class="row" style="justify-content:space-between"><div class="row" style="margin:0"><button onclick="backInv()">← Equipment</button><h2 style="margin:0">${esc(i.n)} <span class="mu" style="font-size:14px">${esc(i.sku)}</span></h2></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
  <div class="card"><h3>Details</h3><div class="kv">
  <i>Status</i><b><span class="tag ${s[1]}">${s[0]}</span>${svcDue(i) ? ' <span class="tag wn">Service due</span>' : ''}</b>
  <i>Category</i><b>${esc(nm('cats', i.cat))}</b>
  <i>Location</i><b>${esc(nm('locs', i.loc))}</b>
  <i>Available</i><b>${avail(i)} of ${i.qty} (threshold ${i.min})</b>
  <i>Unit price</i><b>${money(i.price)} — stock value ${money(i.qty * i.price)}</b>
  <i>Supplier</i><b>${i.supplier ? esc(i.supplier) : '<span class="mu">—</span>'}</b>
  <i>Purchased</i><b>${i.purchased ? esc(i.purchased) : '<span class="mu">—</span>'}</b>
  <i>Next service</i><b>${svcTag}</b>
  <i>Serials</i><b>${i.serials ? esc(i.serials) : '<span class="mu">—</span>'}</b>
  <i>Notes</i><b>${i.notes ? esc(i.notes) : '<span class="mu">—</span>'}</b></div></div>
  <div class="card"><h3>Asset label</h3>${code39Svg(i.sku)}<div class="mu" style="font-size:12px;margin-top:6px">Code 39 · prints with quiet zones</div>
  <div class="row" style="margin:10px 0 0"><button class="p" onclick="coForm('${i.id}')">New movement</button><button onclick="itemForm('${i.id}')">Edit</button><button onclick="svcForm('${i.id}')">Log service</button><button onclick="printLabel('${i.id}')">Print label</button><button class="d" onclick="delItem('${i.id}')">Delete</button></div></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
  <div class="card"><h3>Checkout history</h3><div class="tw"><table><tr><th>Person</th><th>Qty</th><th>Out</th><th>Due</th><th>Status</th></tr>
  ${hist.map(c => `<tr><td>${esc(nm('people', c.who))}</td><td>${c.qty || 1}</td><td>${c.out}</td><td>${c.due}</td><td>${c.back ? esc(c.back) : overdue(c) ? `<span class="tag er">${late(c)}d late</span>` : '<span class="tag ok">On loan</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="mu">Never checked out</td></tr>'}</table></div></div>
  <div class="card"><h3>Service history</h3><div class="tw"><table><tr><th>Date</th><th>Details</th><th>By</th><th>Cost</th></tr>
  ${svh.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.what)}</td><td>${esc(x.by || '—')}</td><td>${x.cost ? money(x.cost) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="mu">No service records</td></tr>'}</table></div></div></div>`;
}

/* ---------- dialogs ---------- */
function dlg(html) { $('#dlg').innerHTML = html; $('#dlg').showModal(); }
const sel = (a, v, id) => `<select id="${id}">${S[a].map(x => `<option value="${x.id}" ${x.id == v ? 'selected' : ''}>${esc(x.n)}</option>`).join('')}</select>`;

function itemForm(id) {
  const i = S.items.find(x => x.id == id) || { n: '', sku: '', qty: 1, min: 1, price: 0, supplier: '', purchased: '', nextsvc: '', serials: '', notes: '' };
  dlg(`<h3>${id ? 'Edit' : 'Add'} item</h3>
  <label>Name<input id="f1" value="${esc(i.n)}"></label>
  <label>SKU (leave blank to auto-assign)<input id="f0" value="${esc(i.sku)}" placeholder="AV-0000"></label>
  <label>Category${sel('cats', i.cat, 'f2')}</label><label>Location${sel('locs', i.loc, 'f3')}</label>
  <label>Quantity<input id="f4" type="number" min="0" value="${i.qty}"></label>
  <label>Low-stock threshold<input id="f5" type="number" min="0" value="${i.min}"></label>
  <label>Unit price ($)<input id="f6" type="number" min="0" value="${i.price}"></label>
  <label>Supplier<input id="f7" value="${esc(i.supplier)}"></label>
  <label>Purchase date<input id="f8" type="date" value="${i.purchased}"></label>
  <label>Next service due (optional)<input id="f9" type="date" value="${i.nextsvc}"></label>
  <label>Serial numbers (one per line)<textarea id="f10">${esc(i.serials)}</textarea></label>
  <label>Notes<textarea id="f11">${esc(i.notes)}</textarea></label>
  <div class="row"><button class="p" onclick="saveItem('${id || ''}')">Save</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
}
function saveItem(id) {
  const d = {
    n: $('#f1').value.trim(), sku: $('#f0').value.trim().toUpperCase(), cat: $('#f2').value, loc: $('#f3').value,
    qty: Math.max(0, +$('#f4').value || 0), min: Math.max(0, +$('#f5').value || 0), price: Math.max(0, +$('#f6').value || 0),
    supplier: $('#f7').value.trim(), purchased: $('#f8').value, nextsvc: $('#f9').value,
    serials: $('#f10').value.trim(), notes: $('#f11').value.trim()
  };
  if (!d.n || !d.cat || !d.loc) return alert('Name, category and location are required');
  if (d.sku && S.items.some(x => x.sku == d.sku && x.id != id)) return alert('SKU ' + d.sku + ' is already used by another item.');
  if (!d.sku) d.sku = nextSku(new Set(S.items.map(x => x.sku).filter(Boolean)));
  if (id) { Object.assign(S.items.find(x => x.id == id), d); log('Updated ' + d.n + ' (' + d.sku + ')'); }
  else { S.items.push({ id: uid(), ...d }); log('Added ' + d.n + ' (' + d.sku + ')'); }
  $('#dlg').close(); render();
}
function delItem(id) {
  const i = S.items.find(x => x.id == id);
  if (act(i)) return alert('Cannot delete: item is checked out.');
  if (confirm('Delete ' + i.n + ' (' + i.sku + ')?')) {
    S.items = S.items.filter(x => x !== i);
    log('Deleted ' + i.n + ' (' + i.sku + ')');
    if (view == 'item') { view = 'inv'; curId = ''; }
    render();
  }
}

/* ---------- movement register (returnable & permanent) ---------- */
const ORG = { name: 'Audio Visual Department', sub: 'Inventory · Checkout · Approvals' }; /* edit for your organisation */
const defAppr = () => ({ hod: { n: '', d: '', s: 'Pending' }, gm: { n: '', d: '', s: 'Pending' } });
function normAppr(a) { a = a && typeof a == 'object' ? a : {}; const fix = (x, d) => ({ n: (x && x.n) || '', d: (x && x.d) || '', s: x && ['Approved', 'Rejected'].includes(x.s) ? x.s : 'Pending' }); return { hod: fix(a.hod, defAppr().hod), gm: fix(a.gm, defAppr().gm) }; }
function nextMvt() { let m = 0; S.co.forEach(c => { const x = /^MV-(\d+)$/.exec(c.mvt || ''); if (x) m = Math.max(m, +x[1]); }); return 'MV-' + String(m + 1).padStart(4, '0'); }
const MVTTYPE = { returnable: ['Returnable', 'ok'], transfer: ['Transfer', 'wn'], consumed: ['Written off', 'er'] };
function co() {
  const list = S.co.filter(c => tab == 'active' ? (c.type == 'returnable' && !c.back) : tab == 'hist' ? (c.type == 'returnable' && c.back) : c.type != 'returnable')
    .sort((a, b) => (b.mvt || '').localeCompare(a.mvt || '') || (b.out + '').localeCompare(a.out + ''));
  return `<h2>Movement register</h2><div class="row tabs">
  <button class="${tab == 'active' ? 'on' : ''}" onclick="tab='active';render()">Active returns</button>
  <button class="${tab == 'hist' ? 'on' : ''}" onclick="tab='hist';render()">Returned</button>
  <button class="${tab == 'perm' ? 'on' : ''}" onclick="tab='perm';render()">Permanent</button>
  <button class="p" onclick="coForm()">+ Movement form</button><button onclick="coExp()">Export…</button></div>
  <div class="card tw"><table><tr><th>Mvt #</th><th>Date</th><th>Type</th><th>Approvals</th><th>Item</th><th>Qty</th><th>Issued to</th><th>Destination / purpose</th><th>Due</th><th>Status</th><th></th></tr>
  ${list.map(c => { const it = S.items.find(x => x.id == c.item); const tt = MVTTYPE[c.type] || MVTTYPE.returnable; const ap = normAppr(c.appr);
    const chip = (k, lbl) => { const a = ap[k]; const cls = a.s == 'Approved' ? 'ok' : a.s == 'Rejected' ? 'er' : 'wn'; return `<span class="tag ${cls}" style="font-size:10px;padding:1px 6px">${lbl} ${a.s == 'Approved' ? '✓' : a.s == 'Rejected' ? '✗' : '…'}</span>`; };
    return `<tr><td><code>${esc(c.mvt || '—')}</code></td><td>${c.out}</td><td><span class="tag ${tt[1]}">${tt[0]}</span></td><td>${chip('hod', 'HOD')} ${chip('gm', 'GM')}</td>
    <td>${it ? `${esc(it.n)} <span class="mu">${esc(it.sku)}</span>` : '<span class="mu">deleted item</span>'}</td>
    <td>${c.qty || 1}</td><td>${esc(nm('people', c.who))}</td>
    <td>${c.type == 'transfer' && c.dest ? `${esc(nm('locs', c.dest))}${c.reason ? ' — ' + esc(c.reason) : ''}` : esc(c.reason || '—')}</td>
    <td>${c.type == 'returnable' ? c.due : '—'}</td>
    <td>${c.type != 'returnable' ? `<span class="tag ${tt[1]}">Closed ${c.back || ''}</span>` : c.back ? esc(c.back) : overdue(c) ? `<span class="tag er">${late(c)} day${late(c) > 1 ? 's' : ''} late</span>` : '<span class="tag ok">On loan</span>'}</td>
    <td>${c.type == 'returnable' && !c.back ? `<button class="s" onclick="checkin('${c.id}')">Check in</button> ` : ''}${c.mvt ? `<button class="s" onclick="printMvtForm('${c.mvt}')">Form</button> ` : ''}<button class="s" onclick="apprForm('${c.id}')">Appr…</button></td></tr>`; }).join('') || '<tr><td colspan="11" class="mu">Nothing here</td></tr>'}</table></div>`;
}
function coExp() {
  const H = ['Mvt #', 'Date', 'Type', 'Item', 'SKU', 'Qty', 'Issued to', 'Destination / purpose', 'Due', 'Status'];
  const rows = S.co.slice().sort((a, b) => (a.mvt || '').localeCompare(b.mvt || '')).map(c => {
    const it = S.items.find(x => x.id == c.item), tt = (MVTTYPE[c.type] || MVTTYPE.returnable)[0];
    return [c.mvt || '', c.out, tt, it ? it.n : '', it ? it.sku : '', c.qty || 1, nm('people', c.who), c.type == 'transfer' && c.dest ? nm('locs', c.dest) + (c.reason ? ' — ' + c.reason : '') : (c.reason || ''), c.type == 'returnable' ? c.due : '', c.type == 'permanent' ? 'Closed ' + (c.back || '') : c.back ? 'Returned ' + c.back : (overdue(c) ? 'Overdue' : 'On loan')];
  });
  expDlg('Movement register', H, rows);
}
function coForm(pre) {
  const av = S.items.filter(i => avail(i) > 0);
  if (!av.length || !S.people.length) return alert('Need available items and at least one person.');
  dlg(`<h3>Movement form</h3>
  <label>Movement type<select id="m0" onchange="mvtTypeUi()">
  <option value="returnable">Returnable — item must come back (loan)</option>
  <option value="transfer">Permanent — transfer to another location</option>
  <option value="consumed">Permanent — consumed / written off</option></select></label>
  <div id="lines"></div>
  <div class="row"><button class="s" onclick="addLine()">+ Add another item</button></div>
  <label>Issued to (person)${sel('people', '', 'm2')}</label>
  <div id="dueRow"><label>Due date<input id="m3" type="date" value="${day(7)}"></label></div>
  <div id="destRow" style="display:none"><label>Destination location${sel('locs', '', 'm4')}</label></div>
  <label>Destination / purpose — notes<input id="m5" placeholder="e.g. Client wedding at Speke Resort / moved to Storage Cage"></label>
  <div class="row"><button class="p" onclick="mvtSave()">Save movement</button><button class="p" onclick="mvtSave(true)">Save & print form</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
  addLine();
  if (pre) { const sel1 = $('#lines .ml-item'); if (sel1) { sel1.value = pre; syncLine($('#lines .mvt-line')); } }
  mvtTypeUi();
}
function mvtTypeUi() {
  const t = $('#m0').value;
  $('#dueRow').style.display = t == 'returnable' ? '' : 'none';
  $('#destRow').style.display = t == 'transfer' ? '' : 'none';
}
function addLine(qty) {
  const av = S.items.filter(i => avail(i) > 0);
  if (!av.length) return;
  const d = document.createElement('div');
  d.className = 'row mvt-line'; d.style.margin = '4px 0';
  d.innerHTML = `<select class="ml-item" style="flex:1;min-width:170px" onchange="syncLine(this.closest('.mvt-line'))">${av.map(i => `<option value="${i.id}">${esc(i.sku)} — ${esc(i.n)} (${avail(i)} avail)</option>`).join('')}</select>
  <input class="ml-qty" type="number" min="1" value="${qty || 1}" style="width:74px" title="Quantity">`;
  $('#lines').appendChild(d);
  syncLine(d);
}
function syncLine(d) {
  const it = S.items.find(x => x.id == d.querySelector('.ml-item').value);
  if (it) { const el = d.querySelector('.ml-qty'); el.max = avail(it); if (+el.value > avail(it)) el.value = avail(it); }
}
function mvtSave() {
  const type = $('#m0').value, who = $('#m2').value, reason = $('#m5').value.trim();
  if (!who) return alert('Choose who the items are issued to.');
  const lines = [...document.querySelectorAll('#dlg .mvt-line')].map(d => ({ item: S.items.find(x => x.id == d.querySelector('.ml-item').value), qty: Math.max(1, Math.floor(+d.querySelector('.ml-qty').value || 1)) })).filter(l => l.item);
  if (!lines.length) return alert('Add at least one item.');
  const mvt = nextMvt();
  if (type == 'returnable') {
    const due = $('#m3').value;
    if (!due) return alert('Due date is required for returnable movements.');
    for (const l of lines) if (l.qty > avail(l.item)) return alert('Only ' + avail(l.item) + ' of ' + l.item.n + ' available.');
    lines.forEach(l => S.co.push({ id: uid(), mvt, type, item: l.item.id, who, qty: l.qty, out: day(0), due, back: null, reason, dest: '', appr: defAppr() }));
    log(`${mvt}: ${lines.map(l => l.item.n + ' ×' + l.qty).join(', ')} issued to ${nm('people', who)} (returnable, due ${due})`);
  } else if (type == 'transfer') {
    const dest = $('#m4').value;
    if (!dest) return alert('Choose a destination location.');
    for (const l of lines) {
      if (l.item.loc == dest) return alert(l.item.n + ' is already at ' + nm('locs', dest) + '.');
      if (l.qty > avail(l.item)) return alert('Only ' + avail(l.item) + ' of ' + l.item.n + ' available.');
    }
    lines.forEach(l => {
      l.item.qty -= l.qty;
      const dst = S.items.find(x => x.n == l.item.n && x.cat == l.item.cat && x.loc == dest);
      if (dst) dst.qty += l.qty;
      else S.items.push({ id: uid(), sku: nextSku(new Set(S.items.map(x => x.sku).filter(Boolean))), n: l.item.n, cat: l.item.cat, loc: dest, qty: l.qty, min: 0, price: l.item.price, supplier: l.item.supplier || '', purchased: l.item.purchased || '', serials: '', nextsvc: '', notes: 'Transferred from ' + l.item.sku });
      S.co.push({ id: uid(), mvt, type, item: l.item.id, who, qty: l.qty, out: day(0), due: '', back: day(0), reason, dest, appr: defAppr() });
    });
    log(`${mvt}: ${lines.map(l => l.item.n + ' ×' + l.qty).join(', ')} transferred to ${nm('locs', dest)} (permanent)`);
  } else {
    for (const l of lines) if (l.qty > avail(l.item)) return alert('Only ' + avail(l.item) + ' of ' + l.item.n + ' available.');
    lines.forEach(l => { l.item.qty -= l.qty; S.co.push({ id: uid(), mvt, type, item: l.item.id, who, qty: l.qty, out: day(0), due: '', back: day(0), reason, dest: '', appr: defAppr() }); });
    log(`${mvt}: ${lines.map(l => l.item.n + ' ×' + l.qty).join(', ')} consumed / written off (permanent)`);
  }
  $('#dlg').close(); render();
  if (print) printMvtForm(mvt);
}
function apprForm(id) {
  const c = S.co.find(x => x.id == id);
  const a = normAppr(c.appr);
  dlg(`<h3>Approvals — ${esc(c.mvt || 'movement')}</h3>
  <label>HOD — Head of Department decision<select id="a1">${opts(['Pending', 'Approved', 'Rejected'], a.hod.s)}</select></label>
  <label>HOD name<input id="a2" value="${esc(a.hod.n)}"></label>
  <label>HOD date<input id="a3" type="date" value="${a.hod.d}"></label>
  <label>GM / AGM decision<select id="a4">${opts(['Pending', 'Approved', 'Rejected'], a.gm.s)}</select></label>
  <label>GM / AGM name<input id="a5" value="${esc(a.gm.n)}"></label>
  <label>GM / AGM date<input id="a6" type="date" value="${a.gm.d}"></label>
  <div class="row"><button class="p" onclick="saveAppr('${id}')">Save</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
}
function saveAppr(id) {
  const c = S.co.find(x => x.id == id);
  const appr = { hod: { s: $('#a1').value, n: $('#a2').value.trim(), d: $('#a3').value }, gm: { s: $('#a4').value, n: $('#a5').value.trim(), d: $('#a6').value } };
  (c.mvt ? S.co.filter(x => x.mvt == c.mvt) : [c]).forEach(x => x.appr = normAppr(appr));
  log(`Approvals for ${c.mvt || 'movement'}: HOD ${appr.hod.s}, GM/AGM ${appr.gm.s}`);
  $('#dlg').close(); render();
}
/* printable approval voucher: header + items + sign-off + HOD / GM-AGM approval blocks */
function printMvtForm(mvt) {
  const lines = mvt ? S.co.filter(c => c.mvt == mvt) : [];
  if (!lines.length) return alert('This movement has no number yet — create it with the movement form first.');
  const c0 = lines[0], isRet = c0.type == 'returnable', ap = normAppr(c0.appr);
  const rows = lines.map((c, i) => { const it = S.items.find(x => x.id == c.item); return `<tr><td style="text-align:center">${i + 1}</td><td>${esc(it ? it.sku : '—')}</td><td>${esc(it ? it.n : 'deleted item')}</td><td style="text-align:center">${c.qty || 1}</td><td>${esc((it && it.serials) || '')}</td></tr>`; }).join('');
  const box = (title, isAppr, dec, name, date) => `<div class="box"><h4>${title}</h4>${isAppr ? `<div class="chk"><label><input type="checkbox" ${dec == 'Approved' ? 'checked' : ''} disabled> Approved</label> &nbsp;&nbsp; <label><input type="checkbox" ${dec == 'Rejected' ? 'checked' : ''} disabled> Rejected</label></div>` : ''}<div class="line"></div><div class="cap">Name${name ? ': ' + esc(name) : ''}</div><div class="line"></div><div class="cap">Signature${date ? ' — Date: ' + esc(date) : ' & date'}</div></div>`;
  const w = window.open('', '_blank', 'width=880,height=1000');
  if (!w) return alert('Allow pop-ups to print the movement form.');
  w.document.write(`<!doctype html><html><head><title>Movement form ${esc(mvt)}</title><style>
  @page{size:A4;margin:12mm}body{font:11px/1.4 'Segoe UI',system-ui,sans-serif;color:#111;margin:0}
  .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #111;padding-bottom:8px}
  .org{font-size:21px;font-weight:800;letter-spacing:.3px}.orgsub{font-size:10px;color:#444;margin-top:2px}
  .ftitle{text-align:right;font-size:14px;font-weight:800;letter-spacing:1.2px;line-height:1.3}
  table.meta{width:100%;border-collapse:collapse;margin-top:10px}table.meta td{padding:3px 10px 3px 0;font-size:11px;vertical-align:top}
  .sec{margin-top:16px;font-weight:800;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;border-bottom:1.5px solid #111;padding-bottom:3px}
  table.items{width:100%;border-collapse:collapse;margin-top:6px}table.items th,table.items td{border:1px solid #8a8a8a;padding:5px 7px;font-size:10.5px;text-align:left}
  table.items th{background:#ececec;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px}
  .sign{display:flex;gap:20px;margin-top:8px}.box{flex:1;border:1px solid #b5b5b5;border-radius:6px;padding:10px;min-height:120px}
  .box h4{margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}.chk{font-size:10.5px;margin-bottom:2px}.chk label{cursor:default}
  .line{border-bottom:1px solid #444;height:24px;margin-top:10px}.cap{font-size:9px;color:#555;margin-top:3px}
  .ft{margin-top:16px;border-top:1px solid #999;padding-top:6px;font-size:8.5px;color:#555;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
  @media print{.noprint{display:none}}
  </style></head><body>
  <div class="hdr"><div><div class="org">${esc(ORG.name)}</div><div class="orgsub">${esc(ORG.sub)}</div></div><div class="ftitle">EQUIPMENT<br>MOVEMENT FORM</div></div>
  <table class="meta">
  <tr><td style="width:50%"><b>Movement No:</b> ${esc(mvt)}</td><td><b>Date of issue:</b> ${esc(c0.out)}</td></tr>
  <tr><td><b>Type:</b> ${isRet ? 'RETURNABLE — item(s) must come back' : 'PERMANENT — transfer / write-off, no return'}</td><td>${isRet ? `<b>Due date:</b> ${esc(c0.due || '')}` : '<b>Return expected:</b> No'}</td></tr>
  <tr><td><b>Issued to:</b> ${esc(nm('people', c0.who))}</td><td><b>Destination / purpose:</b> ${c0.type == 'transfer' && c0.dest ? esc(nm('locs', c0.dest)) + (c0.reason ? ' — ' + esc(c0.reason) : '') : esc(c0.reason || '—')}</td></tr>
  </table>
  <div class="sec">Items</div>
  <table class="items"><tr><th style="width:5%">#</th><th style="width:14%">SKU</th><th>Item description</th><th style="width:7%">Qty</th><th style="width:30%">Serial no. / remarks</th></tr>${rows}</table>
  <div class="sec">Sign-off on issue</div>
  <div class="sign">${box('Issued by (AV officer)', false)}${box('Received by (bearer)', false)}</div>
  <div class="sec">Approval — required before items are released</div>
  <div class="sign">${box('HOD — Head of Department', true, ap.hod.s, ap.hod.n, ap.hod.d)}${box('GM / AGM — General Manager', true, ap.gm.s, ap.gm.n, ap.gm.d)}</div>
  <div class="ft"><span>Form AV-INV-MF-01 · ${esc(mvt)}</span><span>${isRet ? 'Items must be returned by the due date; the bearer is responsible until check-in.' : 'Stock records are updated on approval.'}</span><span>Not valid without HOD and GM/AGM approval</span></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`);
  w.document.close();
}
function checkin(id) {
  const c = S.co.find(x => x.id == id);
  c.back = day(0);
  log(`${nm('items', c.item)} ×${c.qty || 1} checked in from ${nm('people', c.who)}`);
  render();
}

/* ---------- service / maintenance ---------- */
function svcView() {
  const rows = S.svc.slice().sort((a, b) => b.date.localeCompare(a.date));
  return `<h2>Service & Maintenance</h2><div class="row"><button class="p" onclick="svcForm()">+ Log service</button><button onclick="svcExp()">Export…</button></div>
  <div class="card tw"><table><tr><th>Date</th><th>Item</th><th>Details</th><th>By</th><th>Cost</th><th></th></tr>
  ${rows.map(x => { const it = S.items.find(i => i.id == x.item); return `<tr><td>${esc(x.date)}</td><td>${it ? `${esc(it.n)} <span class="mu">${esc(it.sku)}</span>` : '<span class="mu">deleted item</span>'}</td><td>${esc(x.what)}</td><td>${esc(x.by || '—')}</td><td>${x.cost ? money(x.cost) : '—'}</td><td><button class="s d" onclick="delSvc('${x.id}')">Delete</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="mu">No service records yet</td></tr>'}</table></div>`;
}
function svcForm(pre) {
  if (!S.items.length) return alert('Add an item first.');
  dlg(`<h3>Log service</h3>
  <label>Item<select id="s1">${S.items.map(i => `<option value="${i.id}" ${i.id == pre ? 'selected' : ''}>${esc(i.sku)} — ${esc(i.n)}</option>`).join('')}</select></label>
  <label>Date<input id="s2" type="date" value="${today()}"></label>
  <label>What was done<input id="s3" placeholder="e.g. Firmware update, lens clean…"></label>
  <label>By (technician)<input id="s4"></label>
  <label>Cost ($) — optional<input id="s5" type="number" min="0" value="0"></label>
  <div class="row"><button class="p" onclick="saveSvc()">Save</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
}
function saveSvc() {
  const d = { item: $('#s1').value, date: $('#s2').value, what: $('#s3').value.trim(), by: $('#s4').value.trim(), cost: Math.max(0, +$('#s5').value || 0) };
  if (!d.date || !d.what) return alert('Date and details are required');
  S.svc.push({ id: uid(), ...d });
  log(`Service logged for ${nm('items', d.item)}: ${d.what}`);
  $('#dlg').close(); render();
}
function svcExp() { expDlg('Service log', ['Date', 'Item', 'SKU', 'Details', 'By', 'Cost'], S.svc.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => { const it = S.items.find(i => i.id == x.item); return [x.date, it ? it.n : '', it ? it.sku : '', x.what, x.by || '', x.cost || 0]; })); }
function delSvc(id) {
  const x = S.svc.find(a => a.id == id);
  if (confirm('Delete this service record?')) { S.svc = S.svc.filter(a => a !== x); render(); }
}

/* ---------- room installs ---------- */
let ITYPES = ['Display', 'Audio', 'Video Conferencing', 'Control', 'Projection', 'Network', 'Other'], ISTAT = ['Working', 'Needs service', 'Offline'];
const scls = s => s == 'Working' ? 'ok' : s == 'Offline' ? 'er' : 'wn';
function inst() {
  const rows = S.inst.filter(x => !fr || x.room == fr);
  return `<h2>Permanently Installed Equipment</h2><div class="grid">${S.rooms.map(r => { const l = S.inst.filter(x => x.room == r.id), bad = l.filter(x => x.st != 'Working').length; return `<div class="card"><h3>${esc(r.n)}</h3><div class="big">${l.length}</div><div class="${bad ? 'wn' : 'mu'}">${bad ? bad + ' need attention' : 'all working'}</div><button class="s d" style="margin-top:8px" onclick="delS('rooms','inst','room','${r.id}')">Remove room</button></div>`; }).join('')}</div>
  <div class="row"><select onchange="fr=this.value;render()"><option value="">All rooms</option>${S.rooms.map(r => `<option value="${r.id}" ${r.id == fr ? 'selected' : ''}>${esc(r.n)}</option>`).join('')}</select><button onclick="addRoom()">+ Add room</button><button class="p" onclick="instForm()">+ Add install</button><button onclick="instExp()">Export…</button></div>
  <div class="card tw"><table><tr><th>Equipment</th><th>Room</th><th>Type</th><th>Model / Serial</th><th>Installed</th><th>Status</th><th></th></tr>
  ${rows.map(x => `<tr><td>${esc(x.n)}</td><td>${esc(nm('rooms', x.room))}</td><td>${esc(x.type)}</td><td>${esc(x.sn)}</td><td>${esc(x.date)}</td><td><span class="tag ${scls(x.st)}">${esc(x.st)}</span></td><td><button class="s" onclick="instForm('${x.id}')">Edit</button> <button class="s d" onclick="delInst('${x.id}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="mu">No installed equipment</td></tr>'}</table></div>`;
}
const opts = (a, v) => a.map(o => `<option ${o == v ? 'selected' : ''}>${o}</option>`).join('');
function instForm(id) {
  if (!S.rooms.length) return alert('Add a room first.');
  const x = S.inst.find(a => a.id == id) || { n: '', sn: '', type: 'Display', st: 'Working', date: today(), room: fr };
  dlg(`<h3>${id ? 'Edit' : 'Add'} installed equipment</h3><label>Name<input id="g1" value="${esc(x.n)}"></label><label>Room${sel('rooms', x.room, 'g2')}</label><label>Type<select id="g3">${opts(ITYPES, x.type)}</select></label>
  <label>Model / Serial<input id="g4" value="${esc(x.sn)}"></label><label>Install date<input id="g5" type="date" value="${x.date}"></label><label>Status<select id="g6">${opts(ISTAT, x.st)}</select></label>
  <div class="row"><button class="p" onclick="saveInst('${id || ''}')">Save</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
}
function saveInst(id) {
  const d = { n: $('#g1').value.trim(), room: $('#g2').value, type: $('#g3').value, sn: $('#g4').value.trim(), date: $('#g5').value, st: $('#g6').value };
  if (!d.n) return alert('Name is required');
  if (id) { Object.assign(S.inst.find(x => x.id == id), d); log(`Updated install: ${d.n} (${nm('rooms', d.room)})`); }
  else { S.inst.push({ id: uid(), note: '', ...d }); log(`Installed ${d.n} in ${nm('rooms', d.room)}`); }
  $('#dlg').close(); render();
}
function delInst(id) {
  const x = S.inst.find(a => a.id == id);
  if (confirm('Remove ' + x.n + ' from the install list?')) { S.inst = S.inst.filter(a => a !== x); log(`Removed install: ${x.n}`); render(); }
}
function addRoom() { const n = (prompt('Room name') || '').trim(); if (n) { S.rooms.push({ id: uid(), n }); log('Added room: ' + n); render(); } }
function instExp() { expDlg('Installed equipment', ['Equipment', 'Room', 'Type', 'Model / Serial', 'Installed', 'Status'], (fr ? S.inst.filter(x => x.room == fr) : S.inst).map(x => [x.n, nm('rooms', x.room), x.type, x.sn, x.date, x.st])); }

/* ---------- categories / locations / people ---------- */
const KINDLBL = { cats: 'category', locs: 'location', people: 'person' };
function simple(k, title, ref, fk) {
  const isP = k == 'people';
  return `<h2>${title}</h2><div class="row"><input id="ni" placeholder="New name…">${isP ? '<input id="ni2" placeholder="Email or phone (optional)">' : ''}<button class="p" onclick="addS('${k}')">Add</button></div>
  <div class="card tw"><table><tr><th>Name</th>${isP ? '<th>Contact</th>' : ''}<th>${ref == 'co' ? 'Checkouts' : 'Items'}</th><th></th></tr>
  ${S[k].map(x => { const n = S[ref].filter(r => r[fk] == x.id).length; return `<tr><td>${esc(x.n)}</td>${isP ? `<td class="mu">${esc(x.contact || '—')}</td>` : ''}<td>${n}</td><td>${isP ? `<button class="s" onclick="editP('${x.id}')">Edit</button> ` : ''}<button class="s d" onclick="delS('${k}','${ref}','${fk}','${x.id}')">Delete</button></td></tr>`; }).join('')}</table></div>`;
}
function addS(k) {
  const n = $('#ni').value.trim();
  if (!n) return;
  const rec = { id: uid(), n };
  if (k == 'people') rec.contact = ($('#ni2') ? $('#ni2').value.trim() : '');
  S[k].push(rec);
  log(`Added ${KINDLBL[k] || k}: ${n}`);
  render();
}
function editP(id) {
  const p = S.people.find(x => x.id == id);
  dlg(`<h3>Edit person</h3><label>Name<input id="p1" value="${esc(p.n)}"></label><label>Email / phone<input id="p2" value="${esc(p.contact || '')}"></label>
  <div class="row"><button class="p" onclick="saveP('${id}')">Save</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
}
function saveP(id) {
  const p = S.people.find(x => x.id == id), n = $('#p1').value.trim();
  if (!n) return alert('Name is required');
  p.n = n; p.contact = $('#p2').value.trim();
  log('Updated person: ' + n);
  $('#dlg').close(); render();
}
function delS(k, ref, fk, id) {
  const x = S[k].find(a => a.id == id);
  if (S[ref].some(r => r[fk] == id)) return alert(`Cannot delete "${x.n}": it is still in use.`);
  if (confirm('Delete ' + x.n + '?')) { S[k] = S[k].filter(a => a !== x); log(`Deleted ${KINDLBL[k] || k}: ${x.n}`); render(); }
}

/* ---------- activity log ---------- */
function logv() {
  return `<h2>Activity Log</h2><div class="card"><ul class="log">${S.log.map(l => `<li>${esc(l.m)} <span class="mu">— ${new Date(l.t).toLocaleString()}</span></li>`).join('')}</ul></div>`;
}

/* ---------- data & backup ---------- */
function datav() {
  const bytes = (localStorage.getItem(KEY) || '').length;
  const kb = bytes > 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B';
  const c = ghCfg();
  return `<h2>Data & Backup</h2>
  <div class="card" style="margin-bottom:12px"><h3>GitHub sync — data saved as a file in a repo</h3>
  ${ghReady() ? `<div class="kv" style="margin-bottom:10px"><i>Repo</i><b>${esc(c.owner)}/${esc(c.repo)} · branch ${esc(c.branch || 'main')}</b><i>Data file</i><b>${esc(c.path || 'data/inventory.json')}</b><i>Last sync</i><b>${c.lastSync ? esc(c.lastSync.slice(0, 16).replace('T', ' ')) + ' UTC' : 'never'}</b><i>Auto-sync</i><b>${c.auto ? 'On — pushes ~15 s after changes, pulls on startup' : 'Off'}</b></div>` : '<p class="mu">Not configured yet. Your inventory data can be committed to a GitHub repo (ideally a <b>private</b> one) through the GitHub API — so every device shares the same data.</p>'}
  <div class="row"><input id="ghOwner" placeholder="owner, e.g. sterio1production" style="max-width:230px" value="${esc(c.owner || '')}"><input id="ghRepo" placeholder="repo, e.g. av-inventory-data" style="max-width:230px" value="${esc(c.repo || '')}"><input id="ghBranch" placeholder="branch" style="max-width:100px" value="${esc(c.branch || 'main')}"><input id="ghPath" placeholder="file path" style="max-width:190px" value="${esc(c.path || 'data/inventory.json')}"></div>
  <div class="row"><input id="ghToken" type="password" placeholder="${c.token ? 'token is saved — leave blank to keep it' : 'personal access token (fine-grained, Contents: Read & write)'}" style="flex:1;min-width:240px"><button class="p" onclick="ghSaveCfg()">Save & test</button></div>
  <div class="row"><button onclick="ghPull(false)">Pull now</button><button class="p" onclick="ghPush(false)">Push now</button><button onclick="ghToggleAuto()">${c.auto ? 'Turn auto-sync off' : 'Turn auto-sync on'}</button></div>
  <p class="mu" style="margin:8px 0 0;font-size:12px">Token: open <a class="lnk" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> → Repository access: <b>Only select repositories</b> → pick the data repo → Permissions → Contents: <b>Read and write</b>. The token is stored only in this browser. If the repo is public, the data file is public too — use a <b>private</b> repo for real inventory. First time: <b>Push now</b> uploads current data, then turn auto-sync on.</p></div>
  <div class="grid">
  <div class="card"><h3>Export CSV</h3><p class="mu">Spreadsheet-friendly exports of current data.</p><div class="row"><button class="p" onclick="csvItems()">Equipment CSV</button><button onclick="csvCO()">Checkout history CSV</button></div></div>
  <div class="card"><h3>Backup / restore (JSON)</h3><p class="mu">Full snapshot — items, checkouts, service records, installs, log. Data lives only in this browser: keep regular off-device copies.</p><div class="row"><button class="p" onclick="jsonExport()">Download backup</button><label class="filebtn">Restore backup…<input type="file" accept=".json,application/json" onchange="jsonImport(this)"></label></div></div>
  <div class="card"><h3>Danger zone</h3><div class="row"><button onclick="resetSample()">Load demo data</button><button class="d" onclick="clearAll()">Erase all data</button></div></div>
  <div class="card"><h3>Storage</h3><div class="kv"><i>Items</i><b>${S.items.length}</b><i>Checkouts</i><b>${S.co.length}</b><i>Service records</i><b>${S.svc.length}</b><i>Installed equipment</i><b>${S.inst.length}</b><i>Log entries</i><b>${S.log.length}</b><i>Size on disk</i><b>${kb}</b></div></div></div>`;
}
function download(name, mime, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvEsc = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function csvItems() {
  const lines = [['sku', 'name', 'category', 'location', 'qty', 'available', 'min', 'unit_price', 'stock_value', 'supplier', 'purchased', 'next_service', 'serials', 'notes'].join(',')];
  S.items.forEach(i => lines.push([i.sku, i.n, nm('cats', i.cat), nm('locs', i.loc), i.qty, avail(i), i.min, i.price, i.qty * i.price, i.supplier, i.purchased, i.nextsvc, i.serials, i.notes].map(csvEsc).join(',')));
  download('equipment-' + today() + '.csv', 'text/csv;charset=utf-8', '\ufeff' + lines.join('\r\n'));
}
function csvCO() {
  const lines = [['sku', 'item', 'person', 'qty', 'out', 'due', 'returned'].join(',')];
  S.co.forEach(c => { const it = S.items.find(x => x.id == c.item); lines.push([it ? it.sku : '', it ? it.n : '', nm('people', c.who), c.qty || 1, c.out, c.due, c.back || ''].map(csvEsc).join(',')); });
  download('checkout-history-' + today() + '.csv', 'text/csv;charset=utf-8', '\ufeff' + lines.join('\r\n'));
}
function jsonExport() {
  download('av-inventory-backup-' + today() + '.json', 'application/json', JSON.stringify({ app: 'av-inventory-pro', ver: 2, exported: new Date().toISOString(), data: S }, null, 2));
}
function jsonImport(inp) {
  const f = inp.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result), d = j.data || j;
      if (!Array.isArray(d.items) || !Array.isArray(d.cats) || !Array.isArray(d.locs) || !Array.isArray(d.people) || !Array.isArray(d.co)) throw new Error('not a valid backup file');
      if (!confirm('Restore backup' + (j.exported ? ' from ' + j.exported.slice(0, 10) : '') + '? This replaces ALL current data.')) return;
      S = migrate(d);
      log('Backup restored from file');
      save(); render();
    } catch (e) { alert('Import failed: ' + e.message); }
    inp.value = '';
  };
  r.readAsText(f);
}
function resetSample() { if (confirm('Load the demo data set? This replaces ALL current data — export a backup first.')) { S = demoSeed(); save(); render(); } }
function clearAll() {
  if (confirm('Erase ALL data? Export a backup first — this cannot be undone.')) {
    S = { ver: 2, items: [], cats: [], locs: [], people: [], co: [], svc: [], rooms: [], inst: [], log: [{ t: Date.now(), m: 'All data erased' }] };
    save(); render();
  }
}

/* ---------- GitHub sync (data as a JSON file in a repo, via Contents API) ---------- */
const GKEY = KEY + '-gh';
const ghCfg = () => { try { return JSON.parse(localStorage.getItem(GKEY)) || {}; } catch (e) { return {}; } };
const ghSet = c => localStorage.setItem(GKEY, JSON.stringify(c));
const ghReady = () => { const c = ghCfg(); return !!(c.token && c.owner && c.repo); };
let ghPushTimer = null, ghBusy = false;
function dataHash(s) { const str = JSON.stringify(s); let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h); }
const ghClean = () => localStorage.getItem(KEY + '-hash') == null || localStorage.getItem(KEY + '-hash') === dataHash(S);

function utf8ToB64(str) { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
function b64ToUtf8(b64) { const s = atob(String(b64).replace(/\s/g, '')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); }
function ghApi(method, p, body) {
  const c = ghCfg();
  return fetch('https://api.github.com' + p, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(async r => {
    if (r.status === 404) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j && j.message ? r.status + ': ' + j.message : 'HTTP ' + r.status);
    return j;
  });
}
const ghRef = c => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${encodeURIComponent(c.path || 'data/inventory.json').replace(/%2F/g, '/')}?ref=${encodeURIComponent(c.branch || 'main')}`;

async function ghPull(silent) {
  if (!ghReady()) { if (!silent) alert('Configure owner, repo and token first.'); return false; }
  ghBusy = true;
  try {
    const c = ghCfg();
    const j = await ghApi('GET', ghRef(c));
    if (!j || !j.content) { if (!silent) alert('No data file at ' + (c.path || 'data/inventory.json') + ' yet — use Push now to create it.'); return false; }
    const w = JSON.parse(b64ToUtf8(j.content));
    const d = w.data || w;
    if (!Array.isArray(d.items)) throw new Error('file does not contain inventory data');
    const same = JSON.stringify(d) === JSON.stringify(S);
    if (!same && !silent && !ghClean() && !confirm('Remote has changes, but this browser has unsynced edits.\nOK = load remote (local edits lost), Cancel = keep local (next push overwrites remote).')) { return false; }
    if (!same && (silent || ghClean())) { S = migrate(d); log('Pulled data from GitHub (' + c.owner + '/' + c.repo + ')'); }
    ghSet({ ...c, lastSync: new Date().toISOString(), sha: j.sha });
    localStorage.setItem(KEY + '-hash', dataHash(S));
    save(); render();
    return true;
  } catch (e) { if (!silent) alert('Pull failed: ' + e.message); return false; }
  finally { ghBusy = false; }
}

async function ghPush(silent) {
  if (!ghReady()) { if (!silent) alert('Configure owner, repo and token first.'); return false; }
  ghBusy = true;
  try {
    const c = ghCfg();
    let sha = c.sha || null;
    if (!sha) { const j = await ghApi('GET', ghRef(c)); sha = j ? j.sha : undefined; }
    const body = { message: 'AV inventory data sync — ' + new Date().toISOString().replace('T', ' ').slice(0, 16), content: utf8ToB64(JSON.stringify({ app: 'av-inventory-pro', ver: 2, exported: new Date().toISOString(), data: S }, null, 1)), branch: c.branch || 'main' };
    if (sha) body.sha = sha;
    const j = await ghApi('PUT', ghRef(c).split('?')[0], body);
    ghSet({ ...c, lastSync: new Date().toISOString(), sha: (j.content && j.content.sha) || (j.commit && j.commit.sha) });
    localStorage.setItem(KEY + '-hash', dataHash(S));
    log('Pushed data to GitHub (' + c.owner + '/' + c.repo + ')');
    render();
    return true;
  } catch (e) {
    if (!silent) alert(String(e.message).startsWith('409') ? 'Remote changed since last sync — Pull first, then Push.' : 'Push failed: ' + e.message);
    return false;
  }
  finally { ghBusy = false; }
}

function ghAuto() {
  const c = ghCfg();
  if (!c.auto || !ghReady() || ghBusy) return;
  clearTimeout(ghPushTimer);
  ghPushTimer = setTimeout(() => { if (!ghBusy && ghReady() && ghCfg().auto && !ghClean()) ghPush(true); }, 15000);
}

async function ghSaveCfg() {
  const old = ghCfg();
  const c = {
    owner: $('#ghOwner').value.trim(), repo: $('#ghRepo').value.trim(),
    branch: $('#ghBranch').value.trim() || 'main', path: $('#ghPath').value.trim() || 'data/inventory.json',
    token: $('#ghToken').value.trim() || old.token || '', auto: !!old.auto
  };
  if (!c.owner || !c.repo || !c.token) return alert('Owner, repo and token are required.');
  ghSet(c);
  try {
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, { headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(r.status === 401 ? 'token rejected (401)' : r.status === 404 ? 'repo not found, or the token has no access to it (404)' : 'HTTP ' + r.status);
    log('GitHub sync configured: ' + c.owner + '/' + c.repo);
    render();
  } catch (e) { alert('Settings saved, but the connection test failed: ' + e.message); }
}
function ghToggleAuto() { const c = ghCfg(); c.auto = !c.auto; ghSet(c); if (c.auto) ghAuto(); log('GitHub auto-sync ' + (c.auto ? 'enabled' : 'disabled')); render(); }

/* ---------- reports ---------- */
let rptLoc = '', rptRoom = '';
function rpt() {
  const eq = rptLoc ? S.items.filter(i => i.loc == rptLoc) : S.items;
  const rm = rptRoom ? S.inst.filter(x => x.room == rptRoom) : S.inst;
  const locOpts = `<option value="">All locations</option>` + S.locs.map(l => `<option value="${l.id}" ${l.id == rptLoc ? 'selected' : ''}>${esc(l.n)}</option>`).join('');
  const roomOpts = `<option value="">All rooms</option>` + S.rooms.map(r => `<option value="${r.id}" ${r.id == rptRoom ? 'selected' : ''}>${esc(r.n)}</option>`).join('');
  const sum = S.locs.map(l => { const its = S.items.filter(i => i.loc == l.id); return { n: l.n, items: its.length, units: its.reduce((a, i) => a + i.qty, 0), val: its.reduce((a, i) => a + i.qty * i.price, 0), low: its.filter(i => status(i)[1] == 'wn').length, out: its.filter(i => status(i)[1] == 'er').length }; });
  return `<h2>Reports</h2>
  <div class="card" style="margin-bottom:12px"><h3>Equipment inventory per location</h3>
  <div class="row"><select onchange="rptLoc=this.value;render()">${locOpts}</select><button class="p" onclick="rptExpEq()">Export…</button><span class="mu">${eq.length} items · ${money(eq.reduce((a, i) => a + i.qty * i.price, 0))}</span></div>
  <div class="tw"><table><tr><th>SKU</th><th>Item</th><th>Category</th><th>Qty</th><th>Avail</th><th>Unit price</th><th>Value</th><th>Status</th></tr>
  ${eq.map(i => { const s = status(i); return `<tr><td><code>${esc(i.sku)}</code></td><td>${esc(i.n)}</td><td>${esc(nm('cats', i.cat))}</td><td>${i.qty}</td><td>${avail(i)}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td><td><span class="tag ${s[1]}">${s[0]}</span></td></tr>`; }).join('') || '<tr><td colspan="8" class="mu">No items</td></tr>'}</table></div></div>
  <div class="card" style="margin-bottom:12px"><h3>Installed equipment per room</h3>
  <div class="row"><select onchange="rptRoom=this.value;render()">${roomOpts}</select><button class="p" onclick="rptExpRm()">Export…</button><span class="mu">${rm.length} installs · ${rm.filter(x => x.st != 'Working').length} need attention</span></div>
  <div class="tw"><table><tr><th>Equipment</th><th>Room</th><th>Type</th><th>Model / Serial</th><th>Installed</th><th>Status</th></tr>
  ${rm.map(x => `<tr><td>${esc(x.n)}</td><td>${esc(nm('rooms', x.room))}</td><td>${esc(x.type)}</td><td>${esc(x.sn)}</td><td>${esc(x.date)}</td><td><span class="tag ${scls(x.st)}">${esc(x.st)}</span></td></tr>`).join('') || '<tr><td colspan="6" class="mu">No installs</td></tr>'}</table></div></div>
  <div class="card"><h3>Summary per location</h3>
  <div class="row"><button class="p" onclick="rptExpSum()">Export…</button></div>
  <div class="tw"><table><tr><th>Location</th><th>Items</th><th>Units</th><th>Stock value</th><th>Low</th><th>Out</th></tr>
  ${sum.map(r => `<tr><td>${esc(r.n)}</td><td>${r.items}</td><td>${r.units}</td><td>${money(r.val)}</td><td>${r.low || '—'}</td><td>${r.out || '—'}</td></tr>`).join('')}</table></div></div>`;
}
function rptExpEq() { const l = rptLoc ? nm('locs', rptLoc) : 'All locations'; expDlg('Equipment — ' + l, ['SKU', 'Item', 'Category', 'Location', 'Qty', 'Available', 'Unit price', 'Stock value', 'Status'], (rptLoc ? S.items.filter(i => i.loc == rptLoc) : S.items).map(i => [i.sku, i.n, nm('cats', i.cat), nm('locs', i.loc), i.qty, avail(i), i.price, i.qty * i.price, status(i)[0]])); }
function rptExpRm() { const r = rptRoom ? nm('rooms', rptRoom) : 'All rooms'; expDlg('Installed equipment — ' + r, ['Equipment', 'Room', 'Type', 'Model / Serial', 'Installed', 'Status'], (rptRoom ? S.inst.filter(x => x.room == rptRoom) : S.inst).map(x => [x.n, nm('rooms', x.room), x.type, x.sn, x.date, x.st])); }
function rptExpSum() { expDlg('Summary per location', ['Location', 'Items', 'Units', 'Stock value', 'Low', 'Out'], S.locs.map(l => { const its = S.items.filter(i => i.loc == l.id); return [l.n, its.length, its.reduce((a, i) => a + i.qty, 0), its.reduce((a, i) => a + i.qty * i.price, 0), its.filter(i => status(i)[1] == 'wn').length, its.filter(i => status(i)[1] == 'er').length]; })); }

/* ---------- export engine: Excel (.xlsx) / PDF / CSV, zero dependencies ---------- */
let EXP = null;
function expDlg(title, headers, rows) {
  EXP = { title, headers, rows: rows.map(r => r.map(v => v instanceof Date ? v.toISOString().slice(0, 10) : v)) };
  dlg(`<h3>Export — ${esc(title)}</h3><p class="mu">${EXP.rows.length} rows × ${headers.length} columns</p><div class="row"><button class="p" onclick="expDl('xlsx')">Excel (.xlsx)</button><button class="p" onclick="expDl('pdf')">PDF</button><button onclick="expDl('csv')">CSV</button></div>`);
}
function expDl(fmt) {
  if (!EXP) return;
  const { title, headers, rows } = EXP;
  if (fmt == 'xlsx') dlXlsx(title, headers, rows);
  else if (fmt == 'pdf') dlPdf(title, headers, rows);
  else dlCsv(title, headers, rows);
  log(`Exported "${title}" as ${fmt.toUpperCase()} (${rows.length} rows)`);
  $('#dlg').close();
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'export';
const xmlEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function dlCsv(title, headers, rows) {
  const lines = [headers.map(csvEsc).join(',')];
  rows.forEach(r => lines.push(r.map(csvEsc).join(',')));
  download(slug(title) + '-' + today() + '.csv', 'text/csv;charset=utf-8', '\ufeff' + lines.join('\r\n'));
}
/* minimal ZIP (stored entries, CRC-32) — enough for valid .xlsx packages */
function crc32(buf) {
  let t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const chunks = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data instanceof Uint8Array ? f.data : enc.encode(f.data), crc = crc32(data);
    const local = new Uint8Array([80, 75, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name]);
    chunks.push(local, data);
    central.push(new Uint8Array([80, 75, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]));
    off += local.length + data.length;
  }
  const cs = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([80, 75, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), ...u16(0)]);
  return new Blob([...chunks, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function dlXlsx(title, headers, rows) {
  const data = [headers, ...rows];
  const widths = headers.map((h, i) => Math.max(10, Math.min(38, Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length)) + 2)));
  const cell = (v, ri, ci) => {
    const ref = String.fromCharCode(65 + ci) + (ri + 1);
    if (typeof v == 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${ri == 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const sheetName = slug(title).replace(/[^a-z0-9]/g, '').slice(0, 28) || 'Sheet1';
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, ri, ci)).join('')}</row>`).join('')}</sheetData></worksheet>` }
  ];
  download(slug(title) + '-' + today() + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zipStore(files));
}
function pdfEsc(s) { return String(s ?? '').replace(/[\\()]/g, c => '\\' + c).replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'); }
function pdfTrunc(s, w, fs) { const mx = Math.max(2, Math.floor((w - 8) / (fs * 0.5))); s = String(s ?? ''); return s.length > mx ? s.slice(0, Math.max(1, mx - 3)) + '...' : s; }
function dlPdf(title, headers, rows) {
  const land = headers.length > 7;
  const W = land ? 842 : 595, H = land ? 595 : 842, M = 36;
  const usable = W - 2 * M, fs = 8, rh = 15, hh = 17;
  const wts = headers.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length), 4));
  const wsum = wts.reduce((a, b) => a + b, 0) || 1;
  const colW = wts.map(w => usable * w / wsum);
  const perPage = Math.max(5, Math.floor((H - 2 * M - 50) / rh));
  const N = Math.max(1, Math.ceil(rows.length / perPage));
  const contents = [];
  for (let p = 0; p < N; p++) {
    const chunk = rows.slice(p * perPage, (p + 1) * perPage);
    let y = H - M - 20, s = '';
    s += `BT /F2 14 Tf ${M} ${y} Td (${pdfEsc(title)}) Tj ET\n`;
    y -= 13;
    s += `BT /F1 8 Tf ${M} ${y} Td (Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC - AV Inventory Pro - ${rows.length} rows) Tj ET\n`;
    y -= 10;
    s += `0.92 g ${M} ${y - hh + 4} ${usable} ${hh} re f 0 g\n`;
    let x = M;
    headers.forEach((h, i) => { s += `BT /F2 ${fs} Tf ${x + 3} ${y - 5} Td (${pdfEsc(pdfTrunc(h, colW[i], fs))}) Tj ET\n`; x += colW[i]; });
    s += `0.4 w ${M} ${y - hh + 4} m ${W - M} ${y - hh + 4} l S 1 w\n`;
    y -= hh;
    chunk.forEach((r, ri) => {
      if (ri % 2 == 1) s += `0.965 g ${M} ${y - 3} ${usable} ${rh} re f 0 g\n`;
      x = M;
      r.forEach((v, i) => {
        const isNum = typeof v == 'number' && isFinite(v);
        const txt = isNum ? v.toLocaleString('en-US') : String(v ?? '');
        const tx = isNum ? x + colW[i] - 3 - txt.length * fs * 0.5 : x + 3;
        s += `BT /F1 ${fs} Tf ${tx} ${y + 1} Td (${pdfEsc(isNum ? txt : pdfTrunc(txt, colW[i], fs))}) Tj ET\n`;
        x += colW[i];
      });
      y -= rh;
    });
    s += `BT /F1 7 Tf ${M} 22 Td (Page ${p + 1} of ${N} - AV Inventory Pro) Tj ET\n`;
    contents.push(s);
  }
  const head = '%PDF-1.4\n';
  let body = ''; const offs = [];
  const push = s => { offs.push(head.length + body.length); body += s; };
  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  push(`2 0 obj\n<< /Type /Pages /Kids [${Array.from({ length: N }, (_, p) => `${4 + 2 * p} 0 R`).join(' ')}] /Count ${N} >>\nendobj\n`);
  contents.forEach((c, i) => {
    push(`${3 + 2 * i} 0 obj\n<< /Length ${c.length} >>\nstream\n${c}endstream\nendobj\n`);
    push(`${4 + 2 * i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${3 + 2 * N} 0 R /F2 ${4 + 2 * N} 0 R >> >> /Contents ${3 + 2 * i} 0 R >>\nendobj\n`);
  });
  push(`${3 + 2 * N} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
  push(`${4 + 2 * N} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);
  const total = 4 + 2 * N;
  const xrefPos = head.length + body.length;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  offs.forEach(o => { xref += String(o).padStart(10, '0') + ' 00000 n \n'; });
  const all = head + body + xref + `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  const u8 = new Uint8Array(all.length);
  for (let i = 0; i < all.length; i++) { const cc = all.charCodeAt(i); u8[i] = cc > 255 ? 63 : cc; }
  download(slug(title) + '-' + today() + '.pdf', 'application/pdf', u8);
}

/* ---------- Code 39 labels (verified against bwip-js reference encoder) ---------- */
const C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn' };
function code39Svg(text, h = 44, narrow = 2, wide = 5) {
  const clean = String(text || '').toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+%]/g, '');
  const chars = ('*' + clean + '*').split('');
  let x = narrow, rects = '';
  for (const ch of chars) {
    const p = C39[ch];
    if (!p) continue;
    for (let k = 0; k < 9; k++) { const w = p[k] === 'w' ? wide : narrow; if (k % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += w; }
    x += narrow; /* inter-character gap */
  }
  return `<svg class="c39" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + narrow} ${h}" preserveAspectRatio="none" role="img" aria-label="barcode ${esc(clean)}">${rects}</svg>`;
}
function printLabel(id) {
  const i = S.items.find(x => x.id == id);
  if (!i) return;
  const w = window.open('', '_blank', 'width=520,height=380');
  if (!w) return alert('Allow pop-ups to print labels.');
  const label = `<div class="lab"><div class="labn">${esc(i.n)}</div>${code39Svg(i.sku)}<div class="labs"><b>${esc(i.sku)}</b> · ${esc(nm('cats', i.cat))} · ${esc(nm('locs', i.loc))}</div></div>`;
  w.document.write(`<!doctype html><html><head><title>Label — ${esc(i.sku)}</title><style>
  body{font:12px system-ui,sans-serif;margin:0;padding:6mm;display:flex;gap:6mm;flex-wrap:wrap}
  .lab{width:2.25in;height:1.25in;border:1px dashed #bbb;padding:2mm;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between}
  .labn{font-weight:700;font-size:11px;line-height:1.15}
  .c39{width:100%;height:.36in;display:block;background:#fff;padding:0}
  .labs{font-size:9px;color:#333;white-space:nowrap;overflow:hidden}
  @media print{body{padding:0}.lab{border:none}@page{margin:5mm}}
  </style></head><body>${label}<script>window.onload=function(){setTimeout(function(){window.print()},150)}<\/script></body></html>`);
  w.document.close();
}

/* ---------- init ---------- */
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
if (!S || !S.items) S = seed();
S = migrate(S);
applyTheme();
render();
if (ghReady() && ghCfg().auto) ghPull(true);
