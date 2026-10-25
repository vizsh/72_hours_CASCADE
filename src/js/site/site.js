/* Shared website layer: engine client (Web Worker pool), header, footer, command palette,
   number and chart helpers. Every page under the site loads this after core.js. */
(function (root) {
  const T = root.TWIN;
  const C = T.core;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VERSION = 'v3';

  // ── Engine client ──────────────────────────────────────────────────────
  // Stateful pages (graph, lab, citizen, method) talk to worker 0, which keeps their engine
  // cached. Stateless summaries fan out across the pool.
  const pool = [];
  let fallback = null, seq = 0;
  const pending = new Map();
  function makeWorker() {
    const w = new Worker('src/js/site/twin-worker.js');
    w.busy = 0;
    w.onmessage = (ev) => {
      const { id, result, error } = ev.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id); w.busy--;
      error ? p.reject(new Error(error)) : p.resolve(result);
    };
    w.onerror = (ev) => { ev.preventDefault(); for (const [id, p] of pending) if (p.w === w) { pending.delete(id); p.reject(new Error(ev.message || 'worker failed')); } };
    return w;
  }
  async function mainThread() {
    if (fallback) return fallback;
    fallback = (async () => {
      for (const src of ['src/js/data/geodata.js', 'src/js/engine/scenarios.js', 'src/js/engine/engine.js', 'src/js/engine/interventions.js', 'src/js/engine/analytics.js', 'src/js/engine/comms.js', 'src/js/engine/redteam.js', 'src/js/site/rpc.js']) {
        if (src.includes('geodata.js') && root.TWIN_GEOS && root.TWIN_GEOS.raleigh) continue;
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
      }
      return root.TWIN_RPC;
    })();
    return fallback;
  }
  function call(op, args, opts = {}) {
    let w = null;
    try {
      if (!pool.length) pool.push(makeWorker());
      if (opts.pool) {
        const max = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
        w = pool.reduce((a, b) => (b.busy < a.busy ? b : a));
        if (w.busy > 0 && pool.length < max) { w = makeWorker(); pool.push(w); }
      } else w = pool[0];
    } catch (e) { w = null; }
    if (!w) return mainThread().then((rpc) => new Promise((res, rej) => setTimeout(() => { try { res(rpc.handle(op, args)); } catch (err) { rej(err); } }, 0)));
    const id = ++seq;
    w.busy++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, w });
      w.postMessage({ id, op, args });
    }).catch(async (err) => {
      if (!/worker failed/.test(err.message)) throw err;
      const rpc = await mainThread();
      return rpc.handle(op, args);
    });
  }
  // Scenario summaries are deterministic (seeded): cache them across visits.
  function summary(city, scen) {
    const key = `cascade72:${VERSION}:summary:${city}:${scen}`;
    try { const hit = localStorage.getItem(key); if (hit) return Promise.resolve(JSON.parse(hit)); } catch (e) { /* storage blocked */ }
    return call('summary', { city, scen }, { pool: true }).then((s) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) { /* full */ } return s; });
  }

  // ── Formatting ─────────────────────────────────────────────────────────
  const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));
  const pct = (x) => Math.round(x * 100) + '%';
  function clock(t0, t, tz) {
    const d = new Date(new Date(t0).getTime() + t * 3600e3);
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {});
    return { day: `${p.weekday} ${p.day} ${p.month}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
  }
  const SYS = {
    drainage: { label: 'Drainage', hex: '#4a95dc' }, traffic: { label: 'Roads', hex: '#e8a33d' }, power: { label: 'Power', hex: '#b39af0' },
    telecom: { label: 'Telecom', hex: '#5fc8d6' }, ems: { label: 'EMS', hex: '#e9787c' }, hospital: { label: 'Hospitals', hex: '#ef6b73' }, weather: { label: 'Weather', hex: '#8a939e' },
  };

  // ── Count-up when visible ──────────────────────────────────────────────
  function countUp(el, to, { dur = 1100, dec = 0, prefix = '', suffix = '' } = {}) {
    const fmt = (v) => prefix + v.toFixed(dec) + suffix;
    if (reduced) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(to * (p >= 1 ? 1 : e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function whenVisible(el, fn, margin = '0px 0px -12% 0px') {
    if (!('IntersectionObserver' in root)) { fn(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
    io.observe(el);
  }

  // ── Canvas helpers ─────────────────────────────────────────────────────
  function prep(canvas, h) {
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const hh = h || canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    return { g, w, h: hh };
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Line chart: series [{ y: Float32Array|Array, x0, dx, color, width, fill, dash, alpha }], bands [{ y0, y1, color }],
  // marks [{ x, label, color }], xr [lo, hi], yr [lo, hi], xticks fn, yticks [...]
  function chart(canvas, o) {
    const { g, w, h } = prep(canvas, o.height);
    const pad = { l: o.padL ?? 34, r: o.padR ?? 12, t: o.padT ?? 10, b: o.padB ?? 22 };
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
    const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
    const mono = '500 10px ' + css('--font-mono');
    g.font = mono;
    for (const b of o.bands || []) { g.fillStyle = b.color; g.fillRect(pad.l, Y(b.y1), w - pad.l - pad.r, Y(b.y0) - Y(b.y1)); }
    g.strokeStyle = 'rgba(220,230,245,0.07)'; g.lineWidth = 1; g.fillStyle = '#6a737e';
    for (const yt of o.yticks || []) { const yy = Math.round(Y(yt)) + 0.5; g.beginPath(); g.moveTo(pad.l, yy); g.lineTo(w - pad.r, yy); g.stroke(); g.textAlign = 'right'; g.fillText(o.yfmt ? o.yfmt(yt) : String(yt), pad.l - 6, yy + 3); }
    for (const xt of o.xticks || []) { const xx = X(xt); g.textAlign = 'center'; g.fillText(o.xfmt ? o.xfmt(xt) : String(xt), xx, h - 6); }
    for (const b of o.ribbons || []) {
      g.beginPath();
      for (let q = 0; q < b.hi.length; q++) { const xx = X(b.x0 + q * b.dx); q ? g.lineTo(xx, Y(b.hi[q])) : g.moveTo(xx, Y(b.hi[q])); }
      for (let q = b.lo.length - 1; q >= 0; q--) g.lineTo(X(b.x0 + q * b.dx), Y(b.lo[q]));
      g.closePath(); g.fillStyle = b.color; g.fill();
    }
    for (const s of o.series) {
      const n = s.y.length;
      if (!n) continue;
      g.beginPath();
      for (let q = 0; q < n; q++) { const xx = X((s.x0 || 0) + q * (s.dx || 1)), yy = Y(s.y[q]); q ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      if (s.fill) {
        g.save(); g.globalAlpha = s.fillAlpha ?? 0.16; g.lineTo(X((s.x0 || 0) + (n - 1) * (s.dx || 1)), Y(s.base ?? y0)); g.lineTo(X(s.x0 || 0), Y(s.base ?? y0)); g.closePath(); g.fillStyle = s.fill; g.fill(); g.restore();
        g.beginPath();
        for (let q = 0; q < n; q++) { const xx = X((s.x0 || 0) + q * (s.dx || 1)), yy = Y(s.y[q]); q ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      }
      g.setLineDash(s.dash || []); g.globalAlpha = s.alpha ?? 1; g.strokeStyle = s.color; g.lineWidth = s.width || 1.6; g.lineJoin = 'round'; g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }
    for (const m of o.marks || []) {
      const xx = Math.round(X(m.x)) + 0.5;
      g.strokeStyle = m.color || 'rgba(255,255,255,0.5)'; g.setLineDash(m.dash || [3, 3]); g.beginPath(); g.moveTo(xx, pad.t); g.lineTo(xx, h - pad.b); g.stroke(); g.setLineDash([]);
      if (m.label) { g.fillStyle = m.color || '#a2abb6'; g.textAlign = m.align || 'left'; g.fillText(m.label, xx + (m.align === 'right' ? -5 : 5), pad.t + 10 + (m.row || 0) * 12); }
    }
    return { X, Y, w, h, pad, g };
  }

  // ── Chrome ─────────────────────────────────────────────────────────────
  const PAGES = [
    { href: 'twin.html', label: 'Operations room', key: 'twin' },
    { href: 'graph.html', label: 'Knowledge graph', key: 'graph' },
    { href: 'lab.html', label: 'Intervention lab', key: 'lab' },
    { href: 'scenarios.html', label: 'Scenarios', key: 'scenarios' },
    { href: 'live.html', label: 'Live', key: 'live' },
    { href: 'citizen.html', label: 'My area', key: 'citizen' },
    { href: 'method.html', label: 'Method', key: 'method' },
  ];
  const MARK = '<svg class="mark" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 1.5 23 7.25v11.5L13 24.5 3 18.75V7.25z" fill="none" stroke="#79a7e3" stroke-width="1.4"/><path d="M8 17V11.5l3-1.7V17M12.6 17V8.6l3-1.7V17M17.2 17v-5.2l2.2-1.2" fill="none" stroke="#e4e8ee" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ICON = {
    search: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="m10.4 10.4 3.4 3.4"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg>',
  };

  function chrome(active) {
    const head = $('#site-header');
    if (head) {
      head.className = 'site-header';
      head.innerHTML = `
        <div class="wrap header-row">
          <a class="brand" href="index.html" aria-label="CASCADE 72 home">${MARK}<span>CASCADE 72</span></a>
          <nav class="nav" aria-label="Site">${PAGES.filter((p) => p.key !== 'twin').map((p) => `<a href="${p.href}" ${p.key === active ? 'aria-current="page"' : ''}>${p.label}</a>`).join('')}</nav>
          <button class="kbd-btn" id="paletteBtn" type="button" aria-label="Search pages, scenarios and facilities">${ICON.search}<span>Search</span><kbd>Ctrl K</kbd></button>
          <a class="btn primary" href="twin.html">Open operations room ${ICON.arrow}</a>
          <button class="menu-btn" id="menuBtn" type="button" aria-label="Menu" aria-expanded="false">${ICON.menu}</button>
        </div>
        <nav class="mobile-nav" id="mobileNav" hidden aria-label="Site">${PAGES.map((p) => `<a href="${p.href}">${p.label}</a>`).join('')}</nav>`;
      $('#menuBtn').addEventListener('click', () => { const m = $('#mobileNav'); m.hidden = !m.hidden; $('#menuBtn').setAttribute('aria-expanded', String(!m.hidden)); });
      $('#paletteBtn').addEventListener('click', openPalette);
      const onScroll = () => head.classList.toggle('scrolled', root.scrollY > 8);
      root.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }
    const foot = $('#site-footer');
    if (foot) {
      foot.className = 'site-footer';
      foot.innerHTML = `
        <div class="wrap footer-grid">
          <div>
            <a class="brand" href="index.html">${MARK}<span>CASCADE 72</span></a>
            <p>Built in 24 hours for CASCADE '26 (Theme 2 · The 72-Hour Warning) at IIIT Nagpur. Decision support only: it proposes, people decide.</p>
          </div>
          <div><h4>Explore</h4>${PAGES.map((p) => `<a href="${p.href}">${p.label}</a>`).join('')}</div>
          <div><h4>Data</h4><p>Roads, facilities, rivers and lakes © OpenStreetMap contributors (ODbL). Tiles © OpenMapTiles. Live weather: GFS ensemble via Open-Meteo (CC BY 4.0). City telemetry in replays is simulated and labelled as such.</p></div>
          <div><h4>Source</h4><a href="https://github.com/vizsh/72_hours_CASCADE">github.com/vizsh/72_hours_CASCADE</a><p>Free and open-source: MapLibre GL JS, vanilla JavaScript, Web Workers, Python. No build step.</p></div>
        </div>`;
    }
    root.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      else if (e.key === '/' && !e.target.matches('input, textarea, select')) { e.preventDefault(); openPalette(); }
    });
  }

  // ── Command palette ────────────────────────────────────────────────────
  let palette = null;
  function paletteItems() {
    const items = PAGES.map((p) => ({ group: 'Pages', label: p.label, href: p.href }));
    items.unshift({ group: 'Pages', label: 'Overview', href: 'index.html' });
    for (const s of Object.values(T.scenarios || {})) {
      if (s.cities && !s.cities.includes('nagpur')) continue;
      items.push({ group: 'Replay in the operations room', label: s.label, href: `twin.html?scenario=${s.id}` });
    }
    items.push({ group: 'Replay in the operations room', label: 'Live weather · GFS ensemble', href: 'twin.html?scenario=live' });
    const geo = root.TWIN_GEOS && root.TWIN_GEOS.nagpur;
    if (geo) for (const f of geo.facilities) items.push({ group: 'Facilities in Nagpur', label: f.name, sub: `${f.id} · ${f.district}`, href: `twin.html?select=${encodeURIComponent(f.id)}` });
    items.push({ group: 'Cities', label: 'Raleigh, NC (unseen-city test)', href: 'twin.html?city=raleigh' });
    return items;
  }
  function openPalette() {
    if (!palette) {
      palette = document.createElement('div');
      palette.className = 'palette';
      palette.innerHTML = `<div class="palette-box" role="dialog" aria-modal="true" aria-label="Search">
          <div class="palette-in">${ICON.search}<input type="text" placeholder="Jump to a page, scenario or facility…" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
          <div class="palette-list" role="listbox"></div></div>`;
      document.body.appendChild(palette);
      const input = $('input', palette), list = $('.palette-list', palette);
      const all = paletteItems();
      let sel = 0, shown = [];
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        shown = (q ? all.filter((x) => (x.label + ' ' + (x.sub || '') + ' ' + x.group).toLowerCase().includes(q)) : all.filter((x) => x.group !== 'Facilities in Nagpur')).slice(0, 40);
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        let g = '';
        list.innerHTML = shown.map((x, n) => { const head = x.group !== g ? `<div class="pal-group">${esc(x.group)}</div>` : ''; g = x.group; return `${head}<a class="pal-item ${n === sel ? 'on' : ''}" role="option" href="${x.href}" data-n="${n}"><span>${esc(x.label)}</span>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</a>`; }).join('') || '<div class="pal-empty">No match. Try a facility name like "Ambazari" or a scenario like "chlorine".</div>';
      };
      input.addEventListener('input', () => { sel = 0; draw(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); $('.pal-item.on', list)?.scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); $('.pal-item.on', list)?.scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'Enter' && shown[sel]) location.href = shown[sel].href;
      });
      palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });
      palette.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePalette(); });
      draw();
    }
    palette.classList.add('open');
    const input = $('input', palette);
    input.value = ''; input.dispatchEvent(new Event('input'));
    setTimeout(() => input.focus(), 10);
  }
  function closePalette() { if (palette) palette.classList.remove('open'); }

  root.SITE = { $, $$, esc, call, summary, chrome, countUp, whenVisible, prep, chart, css, fmtK, pct, clock, SYS, reduced, ICON, MARK, PAGES };
})(window);
