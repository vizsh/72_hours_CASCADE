/* Knowledge graph: the learned dependency network as a live, physical graph. */
(function () {
  const S = window.SITE, { $, $$, esc } = S;
  const geo = window.TWIN_GEOS.nagpur;
  S.chrome('graph');
  const HEX = { normal: '#3fb27f', watch: '#e2b93b', high: '#ee8a2a', critical: '#e5484d' };
  const TINT = { normal: '#0b0e12', watch: '#2b2714', high: '#33220f', critical: '#3b1517' };
  const stateKey = (r) => (r >= 0.75 ? 'critical' : r >= 0.55 ? 'high' : r >= 0.35 ? 'watch' : 'normal');
  const SYS_ORDER = ['weather', 'drainage', 'traffic', 'power', 'telecom', 'ems', 'hospital'];
  const params = new URLSearchParams(location.search);
  let scen = params.get('scenario') || 'monsoon2023';

  // Scenario menu
  const scenSel = $('#gScen');
  const list = Object.values(window.TWIN.scenarios).filter((s) => !s.cities || s.cities.includes('nagpur')).sort((a, b) => Number(!!b.cities) - Number(!!a.cities));
  scenSel.innerHTML = list.map((s) => `<option value="${s.id}" ${s.id === scen ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  scenSel.addEventListener('change', () => { scen = scenSel.value; load(); });

  const canvas = $('#gCanvas'), side = $('#gSide');
  let snap = null, nodes = [], k = 144, layout = 'force', hidden = new Set(), showFakes = false;
  let hover = -1, selected = params.get('select') ? geo.facilities.findIndex((f) => f.id === params.get('select')) : -1;
  let view = { s: 1, x: 0, y: 0 }, W = 0, H = 0, dpr = 1;
  const phase = new Float32Array(200);

  // ── Data ──────────────────────────────────────────────────────────────
  function load() {
    snap = null;
    setStatus('Assimilating 72 h of sensor streams with a 200-member ensemble…');
    S.call('snapshot', { city: 'nagpur', scen }).then((s) => {
      snap = s;
      setStatus(`${s.label} · ${s.NE} candidate links · ${s.N} facilities`, true);
      $('#gT').max = s.K - 1;
      if (!nodes.length) initNodes();
      setK(+$('#gT').value);
      chips();
      renderSide();
    }).catch((e) => setStatus('Engine error: ' + e.message, false, true));
  }
  function setStatus(msg, done, err) {
    const el = $('#gStatus');
    el.className = 'status-line' + (done ? ' done' : '') + (err ? ' err' : '');
    el.innerHTML = `<i class="led"></i>${esc(msg)}`;
  }
  const sysOf = (i) => snap.F[i].sys;

  function initNodes() {
    const sysIndex = Object.fromEntries(SYS_ORDER.map((s, n) => [s, n]));
    nodes = snap.F.map((f, i) => {
      const a = (sysIndex[f.sys] / SYS_ORDER.length) * Math.PI * 2 + Math.random() * 0.5;
      return { i, x: Math.cos(a) * 220 + Math.random() * 40, y: Math.sin(a) * 160 + Math.random() * 40, vx: 0, vy: 0, fixed: false, r: 9 + (3 - f.tier) * 2.5 };
    });
    targets();
  }
  // Layout targets: map (real coordinates) and systems (columns).
  function targets() {
    const F = snap.F;
    const lng = F.map((f) => f.lngLat[0]), lat = F.map((f) => f.lngLat[1]);
    const lx0 = Math.min(...lng), lx1 = Math.max(...lng), ly0 = Math.min(...lat), ly1 = Math.max(...lat);
    const cols = {};
    F.forEach((f, i) => (cols[f.sys] ||= []).push(i));
    for (const n of nodes) {
      const f = F[n.i];
      n.mx = ((f.lngLat[0] - lx0) / (lx1 - lx0) - 0.5) * 760;
      n.my = -((f.lngLat[1] - ly0) / (ly1 - ly0) - 0.5) * 520;
      const col = cols[f.sys].slice().sort((a, b) => F[b].lngLat[1] - F[a].lngLat[1]);
      const ci = SYS_ORDER.indexOf(f.sys), ri = col.indexOf(n.i);
      n.sx = (ci - (SYS_ORDER.length - 1) / 2) * 128;
      n.sy = (ri - (col.length - 1) / 2) * Math.min(44, 520 / col.length);
    }
  }

  // ── Physics ───────────────────────────────────────────────────────────
  function stepPhysics() {
    if (!snap) return;
    const NE = snap.NE;
    const anchors = Object.fromEntries(SYS_ORDER.map((s, n) => [s, [Math.cos((n / SYS_ORDER.length) * Math.PI * 2) * 230, Math.sin((n / SYS_ORDER.length) * Math.PI * 2) * 170]]));
    for (const a of nodes) {
      if (a.fixed) continue;
      let fx = 0, fy = 0;
      if (layout === 'force') {
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y, d2 = Math.max(80, dx * dx + dy * dy);
          const f = 2400 / d2;
          fx += dx * f / Math.sqrt(d2); fy += dy * f / Math.sqrt(d2);
        }
        const an = anchors[sysOf(a.i)];
        fx += (an[0] - a.x) * 0.004 - a.x * 0.002; fy += (an[1] - a.y) * 0.004 - a.y * 0.002;
      } else {
        const tx = layout === 'map' ? a.mx : a.sx, ty = layout === 'map' ? a.my : a.sy;
        fx += (tx - a.x) * 0.09; fy += (ty - a.y) * 0.09;
      }
      a.fx = fx; a.fy = fy;
    }
    if (layout === 'force') {
      for (const ed of snap.E) {
        if (snap.eStat[k * NE + ed.n] === 2) continue;
        const a = nodes[ed.from], b = nodes[ed.to];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const kk = 0.012 * (0.25 + Math.min(1, snap.eMean[k * NE + ed.n] * 2));
        const f = (d - 95) * kk;
        if (!a.fixed) { a.fx += (dx / d) * f; a.fy += (dy / d) * f; }
        if (!b.fixed) { b.fx -= (dx / d) * f; b.fy -= (dy / d) * f; }
      }
    }
    for (const a of nodes) {
      if (a.fixed) continue;
      a.vx = (a.vx + a.fx) * (layout === 'force' ? 0.82 : 0.7);
      a.vy = (a.vy + a.fy) * (layout === 'force' ? 0.82 : 0.7);
      a.x += Math.max(-12, Math.min(12, a.vx)); a.y += Math.max(-12, Math.min(12, a.vy));
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  const toScreen = (x, y) => [W / 2 + view.x + x * view.s, H / 2 + view.y + y * view.s];
  const toWorld = (sx, sy) => [(sx - W / 2 - view.x) / view.s, (sy - H / 2 - view.y) / view.s];

  function neighbours(i) {
    const set = new Set([i]);
    if (!snap) return set;
    for (const ed of snap.E) { if (ed.from === i) set.add(ed.to); if (ed.to === i) set.add(ed.from); }
    return set;
  }
  let last = 0;
  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    stepPhysics();
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (snap) {
      const NE = snap.NE, N = snap.N;
      const focus = hover >= 0 ? neighbours(hover) : selected >= 0 ? neighbours(selected) : null;
      const vis = (i) => !hidden.has(sysOf(i));
      // Edges
      for (const ed of snap.E) {
        if (!vis(ed.from) || !vis(ed.to)) continue;
        const st = snap.eStat[k * NE + ed.n], mean = snap.eMean[k * NE + ed.n], flow = snap.eFlow[k * NE + ed.n];
        const a = nodes[ed.from], b = nodes[ed.to];
        const [x1, y1] = toScreen(a.x, a.y), [x2, y2] = toScreen(b.x, b.y);
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
        const cx = (x1 + x2) / 2 - dy * 0.12, cy = (y1 + y2) / 2 + dx * 0.12;
        const lit = !focus || (focus.has(ed.from) && focus.has(ed.to) && (ed.from === (hover >= 0 ? hover : selected) || ed.to === (hover >= 0 ? hover : selected)));
        g.globalAlpha = lit ? 1 : 0.08;
        const col = window.SITE.SYS[sysOf(ed.to)].hex;
        if (st === 1) { g.strokeStyle = col; g.lineWidth = 0.8 + Math.min(4, mean * 5) * Math.sqrt(view.s); g.setLineDash([]); }
        else if (st === 2) { g.strokeStyle = 'rgba(229,72,77,0.45)'; g.lineWidth = 1; g.setLineDash([1.5, 4]); }
        else { g.strokeStyle = 'rgba(160,170,182,0.32)'; g.lineWidth = 1; g.setLineDash([4, 4]); }
        g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); g.stroke(); g.setLineDash([]);
        // arrowhead at the target's rim
        const rr = nodes[ed.to].r * Math.sqrt(view.s) + 3;
        const ex = x2 - (x2 - cx) / Math.hypot(x2 - cx, y2 - cy) * rr, ey = y2 - (y2 - cy) / Math.hypot(x2 - cx, y2 - cy) * rr;
        const ang = Math.atan2(y2 - cy, x2 - cx);
        if (st !== 2) { g.fillStyle = st === 1 ? col : 'rgba(160,170,182,0.5)'; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - 7 * Math.cos(ang - 0.4), ey - 7 * Math.sin(ang - 0.4)); g.lineTo(ex - 7 * Math.cos(ang + 0.4), ey - 7 * Math.sin(ang + 0.4)); g.closePath(); g.fill(); }
        // particles where stress is flowing now
        if (flow > 0.025 && st !== 2) {
          phase[ed.n] = (phase[ed.n] + dt * (0.35 + flow * 1.6)) % 1;
          for (let p = 0; p < 3; p++) {
            const u = (phase[ed.n] + p / 3) % 1;
            const px = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * cx + u * u * x2, py = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * cy + u * u * y2;
            g.fillStyle = '#ffd2d4'; g.beginPath(); g.arc(px, py, 1.6 + flow * 3, 0, Math.PI * 2); g.fill();
          }
        }
        if (showFakes && ed.spurious) {
          const mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2, my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
          const fooled = st === 1 && mean >= 0.05;
          g.globalAlpha = 1;
          g.fillStyle = '#0b0e12'; g.strokeStyle = fooled ? '#e5484d' : '#e4e8ee'; g.lineWidth = 1.2;
          g.beginPath(); g.arc(mx, my, 8, 0, Math.PI * 2); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(mx - 3.5, my - 3.5); g.lineTo(mx + 3.5, my + 3.5); g.moveTo(mx + 3.5, my - 3.5); g.lineTo(mx - 3.5, my + 3.5); g.stroke();
        }
        g.globalAlpha = 1;
        void L;
      }
      // Nodes
      const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui');
      for (const n of nodes) {
        if (!vis(n.i)) continue;
        const f = snap.F[n.i], r0 = snap.now[k * N + n.i], key = stateKey(r0);
        const [x, y] = toScreen(n.x, n.y);
        const r = n.r * Math.sqrt(view.s) * (n.i === selected ? 1.25 : 1);
        g.globalAlpha = !focus || focus.has(n.i) ? 1 : 0.16;
        if (key === 'critical') { const p = 0.5 + 0.5 * Math.sin(t / 280 + n.i); g.fillStyle = `rgba(229,72,77,${0.12 + 0.16 * p})`; g.beginPath(); g.arc(x, y, r + 6 + 4 * p, 0, Math.PI * 2); g.fill(); }
        g.beginPath();
        for (let a = 0; a < 6; a++) { const th = Math.PI / 6 + (a * Math.PI) / 3; a ? g.lineTo(x + r * Math.cos(th), y + r * Math.sin(th)) : g.moveTo(x + r * Math.cos(th), y + r * Math.sin(th)); }
        g.closePath();
        g.fillStyle = TINT[key];
        g.fill();
        g.lineWidth = n.i === selected ? 2.4 : 1.6; g.strokeStyle = n.i === selected ? '#fff' : window.SITE.SYS[f.sys].hex; g.stroke();
        g.fillStyle = HEX[key]; g.beginPath(); g.arc(x, y, Math.max(2, r * 0.28), 0, Math.PI * 2); g.fill();
        const showLabel = n.i === hover || n.i === selected || (focus && focus.has(n.i)) || (!focus && (f.tier === 1 || view.s > 1.35));
        if (showLabel) {
          g.font = `${n.i === hover || n.i === selected ? 600 : 500} 11.5px ${font}`;
          g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(9,11,14,0.9)';
          const label = f.name.length > 30 ? f.name.slice(0, 28) + '…' : f.name;
          g.strokeText(label, x, y + r + 14); g.fillStyle = '#e4e8ee'; g.fillText(label, x, y + r + 14);
        }
        g.globalAlpha = 1;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── Interaction ───────────────────────────────────────────────────────
  function pick(sx, sy) {
    if (!snap) return -1;
    let best = -1, bd = 18;
    for (const n of nodes) {
      if (hidden.has(sysOf(n.i))) continue;
      const [x, y] = toScreen(n.x, n.y), d = Math.hypot(sx - x, sy - y);
      if (d < Math.max(bd, n.r * Math.sqrt(view.s) + 4) && d < bd + 6) { bd = d; best = n.i; }
    }
    return best;
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const i = pick(sx, sy);
    canvas.setPointerCapture(e.pointerId);
    drag = i >= 0 ? { i, moved: false, sx, sy } : { pan: true, sx, sy, vx: view.x, vy: view.y, moved: false };
    if (i >= 0) nodes[i].fixed = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (drag) {
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
      if (drag.pan) { view.x = drag.vx + sx - drag.sx; view.y = drag.vy + sy - drag.sy; }
      else { const [wx, wy] = toWorld(sx, sy); const n = nodes[drag.i]; n.x = wx; n.y = wy; n.vx = n.vy = 0; }
      return;
    }
    hover = pick(sx, sy);
    canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', () => {
    if (!drag) return;
    if (!drag.pan) { nodes[drag.i].fixed = layout !== 'force' ? false : nodes[drag.i].fixed && drag.moved; if (!drag.moved) select(drag.i); }
    else if (!drag.moved) select(-1);
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; });
  canvas.addEventListener('dblclick', (e) => { const r = canvas.getBoundingClientRect(); const i = pick(e.clientX - r.left, e.clientY - r.top); if (i >= 0) nodes[i].fixed = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [wx, wy] = toWorld(sx, sy);
    view.s = Math.max(0.5, Math.min(3, view.s * Math.exp(-e.deltaY * 0.0012)));
    view.x = sx - W / 2 - wx * view.s; view.y = sy - H / 2 - wy * view.s;
  }, { passive: false });

  $('#gLayout').addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    layout = b.dataset.l;
    $$('#gLayout button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    nodes.forEach((n) => { n.fixed = false; });
    view = { s: 1, x: 0, y: 0 };
  });
  $('#gFakes').addEventListener('change', (e) => { showFakes = e.target.checked; renderSide(); });
  $('#gT').addEventListener('input', (e) => { stopLearn(); setK(+e.target.value); });
  let learnRaf = 0;
  function stopLearn() { cancelAnimationFrame(learnRaf); learnRaf = 0; $('#gLearn').textContent = 'Watch it learn'; }
  $('#gLearn').addEventListener('click', () => {
    if (!snap) return;
    if (learnRaf) return stopLearn();
    $('#gLearn').textContent = 'Stop';
    const t0 = performance.now(), dur = 14000;
    const go = (t) => { const p = Math.min(1, (t - t0) / dur); setK(Math.round(p * (snap.K - 1))); $('#gT').value = k; if (p < 1) learnRaf = requestAnimationFrame(go); else stopLearn(); };
    learnRaf = requestAnimationFrame(go);
  });
  function setK(v) {
    k = Math.max(0, Math.min(snap ? snap.K - 1 : 144, v));
    $('#gTlabel').textContent = `T+${(k * 0.5).toFixed(1)}h`;
    renderSide();
  }
  function chips() {
    $('#gChips').innerHTML = SYS_ORDER.map((s) => `<button class="chip" type="button" data-s="${s}" aria-pressed="${!hidden.has(s)}"><i style="background:${S.SYS[s].hex}"></i>${S.SYS[s].label}</button>`).join('');
    $('#gChips').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; hidden.has(b.dataset.s) ? hidden.delete(b.dataset.s) : hidden.add(b.dataset.s); b.setAttribute('aria-pressed', String(!hidden.has(b.dataset.s))); };
  }
  function select(i) { selected = i; renderSide(); }

  // ── Side panel ────────────────────────────────────────────────────────
  let sideTimer = 0, explainToken = 0;
  function renderSide() {
    clearTimeout(sideTimer);
    sideTimer = setTimeout(renderSideNow, 60);
  }
  function renderSideNow() {
    if (!snap) { side.innerHTML = '<div class="g-side-wait skeleton" style="height:180px"></div>'; return; }
    const NE = snap.NE, N = snap.N;
    const st = [0, 0, 0];
    let real = 0, realConf = 0, fake = 0, fakeOut = 0;
    snap.E.forEach((e) => {
      const s = snap.eStat[k * NE + e.n]; st[s]++;
      if (e.spurious) { fake++; if (s === 2 || (snap.eLearn[k * NE + e.n] > 0.5 && snap.eMean[k * NE + e.n] < 0.05)) fakeOut++; }
      else { real++; if (s === 1) realConf++; }
    });
    const head = `<div class="g-stats">
        <div><span class="mono">${st[1]}</span><small>confirmed</small></div>
        <div><span class="mono">${st[2]}</span><small>pruned</small></div>
        <div><span class="mono">${st[0]}</span><small>awaiting</small></div></div>
      <div class="g-quality">
        <div class="gq-row"><span>Real links confirmed</span><span class="gq-bar"><i style="width:${(realConf / real) * 100}%;background:#79a7e3"></i></span><span class="mono">${realConf}/${real}</span></div>
        ${showFakes ? `<div class="gq-row"><span>Planted fakes rejected</span><span class="gq-bar"><i style="width:${(fakeOut / fake) * 100}%;background:#3fb27f"></i></span><span class="mono">${fakeOut}/${fake}</span></div>` : ''}
      </div>`;
    if (selected < 0) {
      const top = snap.E.map((e) => ({ e, m: snap.eMean[k * NE + e.n], s: snap.eStat[k * NE + e.n], f: snap.eFlow[k * NE + e.n] })).filter((x) => x.s === 1).sort((a, b) => b.f - a.f || b.m - a.m).slice(0, 8);
      side.innerHTML = `${head}<h3 class="g-h">${top.some((x) => x.f > 0.02) ? 'Carrying stress now' : 'Strongest learned links'} <span class="mono dim">${$('#gTlabel').textContent}</span></h3>
        <ul class="g-links">${top.map((x) => `<li><button type="button" data-sel="${x.e.to}"><span>${esc(snap.F[x.e.from].name)} <b>→</b> ${esc(snap.F[x.e.to].name)}</span><small>${esc(x.e.mechanism)}</small><span class="mono">${x.m.toFixed(2)}${x.f > 0.02 ? ` · flow ${x.f.toFixed(2)}` : ''}</span></button></li>`).join('') || '<li class="dim">No link has enough evidence yet. Move the clock forward, or press Watch it learn.</li>'}</ul>
        <p class="g-tip">Click a facility to see what drives it. Drag to rearrange, scroll to zoom, double-click to release a pinned node.</p>`;
      side.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => select(+b.dataset.sel)));
      return;
    }
    const f = snap.F[selected], r0 = snap.now[k * N + selected], key = stateKey(r0);
    const inE = snap.E.filter((e) => e.to === selected), outE = snap.E.filter((e) => e.from === selected);
    const linkRow = (e, other) => { const s = snap.eStat[k * NE + e.n], m = snap.eMean[k * NE + e.n], sd = snap.eSd[k * NE + e.n]; return `<li class="st-${s}"><button type="button" data-sel="${other}"><span>${esc(snap.F[other].name)}</span><small>${esc(e.mechanism)} · lag ${e.lag} h${showFakes && e.spurious ? ' · <b class="risk-critical">planted fake</b>' : ''}</small><span class="mono">${m.toFixed(2)} ± ${sd.toFixed(2)} · ${['candidate', 'confirmed', 'pruned'][s]}</span></button></li>`; };
    side.innerHTML = `<button class="btn ghost sm g-back" type="button" id="gBack">← All links</button>
      <div class="g-node"><h3 class="h3">${esc(f.name)}</h3><div class="g-meta mono">${esc(f.id)} · ${esc(f.subtype || f.type)} · ${esc(f.district)}</div>
      <div class="g-risk"><span class="pill r-${key}">${key === 'normal' ? 'Normal' : key === 'watch' ? 'Watch' : key === 'high' ? 'High risk' : 'Critical'}</span><span class="mono">${Math.round(r0 * 100)}% at ${$('#gTlabel').textContent}</span></div></div>
      <h3 class="g-h">What drives it now</h3><div class="g-drivers" id="gDrivers"><div class="skeleton" style="height:90px"></div></div>
      <h3 class="g-h">Upstream (${inE.length})</h3><ul class="g-links">${inE.map((e) => linkRow(e, e.from)).join('') || '<li class="dim">No candidate upstream links.</li>'}</ul>
      <h3 class="g-h">Downstream (${outE.length})</h3><ul class="g-links">${outE.map((e) => linkRow(e, e.to)).join('') || '<li class="dim">Nothing depends on it in the graph.</li>'}</ul>
      <a class="btn sm" href="twin.html?scenario=${scen}&select=${encodeURIComponent(f.id)}">Open in the operations room →</a>`;
    $('#gBack').addEventListener('click', () => select(-1));
    side.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => select(+b.dataset.sel)));
    const token = ++explainToken;
    S.call('explain', { city: 'nagpur', scen, k, i: selected }).then((ex) => {
      if (token !== explainToken) return;
      const el = $('#gDrivers'); if (!el) return;
      el.innerHTML = ex.drivers.slice(0, 6).map((d) => `<div class="g-drv"><span>${d.kind === 'edge' ? esc(snap.F[d.from].name) : esc(d.label)}</span><span class="g-drv-bar"><i style="width:${Math.max(2, d.share * 100)}%;background:${d.kind === 'edge' ? S.SYS[snap.F[d.from].sys].hex : d.kind === 'hazard' ? '#79a7e3' : '#474e57'}"></i></span><span class="mono">${Math.round(d.share * 100)}%</span></div>`).join('');
    }).catch(() => {});
  }

  load();
})();
