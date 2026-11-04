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
  (s.co || []).forEach(c => { c.qty = c.qty || 1; });
  (s.people || []).forEach(p => { p.contact ??= ''; });
  return s;
}

function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
function log(m) { S.log.unshift({ t: Date.now(), m }); S.log = S.log.slice(0, 200); }
const nm = (a, id) => (S[a].find(x => x.id == id) || { n: '—' }).n;

/* ---------- sample data ---------- */
function seed() {
  const cats = ['Cameras', 'Audio', 'Lighting', 'Projection', 'Cables', 'Computing', 'Support'].map(n => ({ id: uid(), n }));
  const locs = ['Media Studio', 'Main Auditorium', 'Control Room', 'Storage Cage'].map(n => ({ id: uid(), n }));
  const people = [
    ['Amara Okello', 'amara@stereo1.example'], ['Daniel Mugisha', 'daniel@stereo1.example'],
    ['Grace Nakato', 'grace@stereo1.example'], ['Brian Ssemwogerere', 'brian@stereo1.example'],
    ['Lydia Achieng', 'lydia@stereo1.example']
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
    { id: uid(), item: items[0].id, who: people[0].id, qty: 1, out: day(-9), due: day(-2), back: null },
    { id: uid(), item: items[4].id, who: people[1].id, qty: 2, out: day(-1), due: day(5), back: null }
  ];
  const svc = [
    { id: uid(), item: items[8].id, date: day(-40), what: 'Firmware update and connector check', by: 'Daniel M.', cost: 0 },
    { id: uid(), item: items[2].id, date: day(-75), what: 'Sensor cleaning and full inspection', by: 'Amara O.', cost: 60 }
  ];
  return { ver: 2, items, cats, locs, people, co, svc, log: [{ t: Date.now(), m: 'Sample data loaded (v2)' }] };
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
const NAV = [['dash', 'Dashboard'], ['inv', 'Equipment'], ['co', 'Checkout'], ['svc', 'Service'], ['inst', 'Room Installs'], ['cats', 'Categories'], ['locs', 'Locations'], ['people', 'People'], ['log', 'Activity Log'], ['data', 'Data & Backup']];
function go(v) { view = v; curId = ''; nav.classList.remove('open'); render(); }
function openItem(id) { curId = id; view = 'item'; render(); }
function backInv() { view = 'inv'; curId = ''; render(); }
function render() {
  $('#nav').innerHTML = '<h1>AV Inventory Pro<small>Audio Visual Dept.</small></h1>'
    + NAV.map(([k, t]) => `<a class="${k == view || (view == 'item' && k == 'inv') ? 'on' : ''}" onclick="go('${k}')">${t}</a>`).join('')
    + `<div class="navfoot"><button class="s" id="themeBtn" onclick="cycleTheme()"></button></div>`;
  applyTheme();
  $('#v').innerHTML = ({ dash, inv, item: itemDetail, co, svc: svcView, inst, cats: () => simple('cats', 'Categories', 'items', 'cat'), locs: () => simple('locs', 'Locations', 'items', 'loc'), people: () => simple('people', 'People', 'co', 'who'), log: logv, data: datav }[view] || dash)();
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
function inv() {
  let rows = S.items.filter(i => {
    const hay = (i.n + ' ' + i.sku + ' ' + (i.serials || '') + ' ' + (i.supplier || '') + ' ' + (i.notes || '')).toLowerCase();
    return (!q || hay.includes(q)) && (!fc || i.cat == fc) && (!fl || i.loc == fl) && (!fst || (fst == 'svc' ? svcDue(i) : status(i)[1] == fst));
  });
  const key = { n: x => x.n.toLowerCase(), sku: x => x.sku, cat: x => nm('cats', x.cat), loc: x => nm('locs', x.loc), avail: x => avail(x), price: x => x.price }[sort.k];
  rows = rows.slice().sort((a, b) => { const va = key(a), vb = key(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
  const opt = (a, v) => S[a].map(x => `<option value="${x.id}" ${x.id == v ? 'selected' : ''}>${esc(x.n)}</option>`).join('');
  return `<h2>Equipment Inventory</h2><div class="row"><input placeholder="Search name, SKU, serial…" value="${esc(q)}" oninput="q=this.value.toLowerCase();render();const e=$('#v input');e.focus();e.setSelectionRange(99,99)">
  <select onchange="fc=this.value;render()"><option value="">All categories</option>${opt('cats', fc)}</select>
  <select onchange="fl=this.value;render()"><option value="">All locations</option>${opt('locs', fl)}</select>
  <select onchange="fst=this.value;render()"><option value="">All statuses</option><option value="ok" ${fst == 'ok' ? 'selected' : ''}>In stock</option><option value="wn" ${fst == 'wn' ? 'selected' : ''}>Low</option><option value="er" ${fst == 'er' ? 'selected' : ''}>Out of stock</option><option value="svc" ${fst == 'svc' ? 'selected' : ''}>Service due</option></select>
  <button class="p" onclick="itemForm()">+ Add item</button></div>
  <div class="card tw"><table><tr><th class="sortable" onclick="setSort('sku')">SKU${ar('sku')}</th><th class="sortable" onclick="setSort('n')">Item${ar('n')}</th><th class="sortable" onclick="setSort('cat')">Category${ar('cat')}</th><th class="sortable" onclick="setSort('loc')">Location${ar('loc')}</th><th class="sortable" onclick="setSort('avail')">Avail / Total${ar('avail')}</th><th class="sortable" onclick="setSort('price')">Unit price${ar('price')}</th><th>Status</th><th></th></tr>
  ${rows.map(i => { const s = status(i); return `<tr><td><code>${esc(i.sku)}</code></td><td><a class="lnk" onclick="openItem('${i.id}')" title="Open item detail">${esc(i.n)}</a></td><td>${esc(nm('cats', i.cat))}</td><td>${esc(nm('locs', i.loc))}</td><td>${avail(i)} / ${i.qty}</td><td>${money(i.price)}</td><td><span class="tag ${s[1]}">${s[0]}</span>${svcDue(i) ? ' <span class="tag wn">Service</span>' : ''}</td><td><button class="s" onclick="itemForm('${i.id}')">Edit</button> <button class="s d" onclick="delItem('${i.id}')">Delete</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="mu">No items</td></tr>'}</table></div>`;
}

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
  <div class="row" style="margin:10px 0 0"><button class="p" onclick="coForm('${i.id}')">Check out</button><button onclick="itemForm('${i.id}')">Edit</button><button onclick="svcForm('${i.id}')">Log service</button><button onclick="printLabel('${i.id}')">Print label</button><button class="d" onclick="delItem('${i.id}')">Delete</button></div></div></div>
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

/* ---------- checkout / check-in ---------- */
function co() {
  const list = S.co.filter(c => tab == 'active' ? !c.back : c.back).sort((a, b) => a.due < b.due ? -1 : 1);
  return `<h2>Checkout / Check-in</h2><div class="row tabs"><button class="${tab == 'active' ? 'on' : ''}" onclick="tab='active';render()">Active</button><button class="${tab != 'active' ? 'on' : ''}" onclick="tab='hist';render()">History</button><button class="p" onclick="coForm()">+ Check out</button></div>
  <div class="card tw"><table><tr><th>Item</th><th>Person</th><th>Qty</th><th>Out</th><th>Due</th><th>${tab == 'active' ? 'Status' : 'Returned'}</th><th></th></tr>
  ${list.map(c => { const it = S.items.find(x => x.id == c.item); return `<tr><td>${it ? `${esc(it.n)} <span class="mu">${esc(it.sku)}</span>` : '<span class="mu">deleted item</span>'}</td><td>${esc(nm('people', c.who))}</td><td>${c.qty || 1}</td><td>${c.out}</td><td>${c.due}</td><td>${tab == 'active' ? (overdue(c) ? `<span class="tag er">${late(c)} day${late(c) > 1 ? 's' : ''} late</span>` : '<span class="tag ok">On loan</span>') : c.back}</td><td>${tab == 'active' ? `<button class="s" onclick="checkin('${c.id}')">Check in</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="mu">Nothing here</td></tr>'}</table></div>`;
}
function coForm(pre) {
  const av = S.items.filter(i => avail(i) > 0);
  if (!av.length || !S.people.length) return alert('Need available items and at least one person.');
  dlg(`<h3>Check out equipment</h3>
  <label>Item<select id="c1" onchange="syncQty()">${av.map(i => `<option value="${i.id}" ${i.id == pre ? 'selected' : ''}>${esc(i.n)} (${avail(i)} avail)</option>`).join('')}</select></label>
  <label>Quantity<input id="c4" type="number" min="1" value="1"></label>
  <label>Person${sel('people', '', 'c2')}</label>
  <label>Due date<input id="c3" type="date" value="${day(7)}"></label>
  <div class="row"><button class="p" onclick="doOut()">Check out</button><button onclick="$('#dlg').close()">Cancel</button></div>`);
  syncQty();
}
function syncQty() { const it = S.items.find(x => x.id == $('#c1').value); if (it) { const el = $('#c4'); el.max = avail(it); el.value = 1; } }
function doOut() {
  const it = S.items.find(x => x.id == $('#c1').value);
  const qty = Math.max(1, Math.floor(+$('#c4').value || 1));
  if (!it) return;
  if (qty > avail(it)) return alert('Only ' + avail(it) + ' available.');
  const c = { id: uid(), item: it.id, who: $('#c2').value, out: day(0), due: $('#c3').value, back: null, qty };
  if (!c.due) return;
  S.co.push(c);
  log(`${it.n} ×${qty} checked out to ${nm('people', c.who)}`);
  $('#dlg').close(); render();
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
  return `<h2>Service & Maintenance</h2><div class="row"><button class="p" onclick="svcForm()">+ Log service</button></div>
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
  <div class="row"><select onchange="fr=this.value;render()"><option value="">All rooms</option>${S.rooms.map(r => `<option value="${r.id}" ${r.id == fr ? 'selected' : ''}>${esc(r.n)}</option>`).join('')}</select><button onclick="addRoom()">+ Add room</button><button class="p" onclick="instForm()">+ Add install</button></div>
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
  return `<h2>Data & Backup</h2><div class="grid">
  <div class="card"><h3>Export CSV</h3><p class="mu">Spreadsheet-friendly exports of current data.</p><div class="row"><button class="p" onclick="csvItems()">Equipment CSV</button><button onclick="csvCO()">Checkout history CSV</button></div></div>
  <div class="card"><h3>Backup / restore (JSON)</h3><p class="mu">Full snapshot — items, checkouts, service records, installs, log. Data lives only in this browser: keep regular off-device copies.</p><div class="row"><button class="p" onclick="jsonExport()">Download backup</button><label class="filebtn">Restore backup…<input type="file" accept=".json,application/json" onchange="jsonImport(this)"></label></div></div>
  <div class="card"><h3>Danger zone</h3><div class="row"><button class="d" onclick="resetSample()">Reset to sample data</button><button class="d" onclick="clearAll()">Erase all data</button></div></div>
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
function resetSample() { if (confirm('Reset all data to the sample set?')) { S = seed(); save(); render(); } }
function clearAll() {
  if (confirm('Erase ALL data? Export a backup first — this cannot be undone.')) {
    S = { ver: 2, items: [], cats: [], locs: [], people: [], co: [], svc: [], rooms: [], inst: [], log: [{ t: Date.now(), m: 'All data erased' }] };
    save(); render();
  }
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
