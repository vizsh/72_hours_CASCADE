/* City canvas: a lightweight, map-free view of a twin city for the website.

   Oblique mode (home hero): population as columns of light on a tilted plane, streets and
   rivers etched in, facilities on stems, stress travelling along dependency links as pulses.
   Flat mode (My area): the same cells seen from above as a dot map you can click.

   Everything is projected once; a frame only recolours cells and moves pulses, so it holds
   60 fps on a laptop with ~1,800 cells, ~1,000 street segments and ~60 facilities. */
(function (root) {
  const C = root.TWIN.core;
  const HEX = { normal: '#3fb27f', watch: '#e2b93b', high: '#ee8a2a', critical: '#e5484d' };
  const FLOW = { water: '#58a6f0', traffic: '#f0a23a', cascade: '#f2575c' };
  const stateKey = (r) => (r >= 0.75 ? 'critical' : r >= 0.55 ? 'high' : r >= 0.35 ? 'watch' : 'normal');

  function create(canvas, geo, opts = {}) {
    const flat = !!opts.flat;
    const F = geo.facilities, N = F.length;
    const lat0 = geo.center[1];
    const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.54;
    const rot = ((opts.rotate ?? (flat ? 0 : -24)) * Math.PI) / 180;
    const tilt = flat ? 1 : opts.tilt ?? 0.52;
    const local = ([lng, lat]) => {
      const x = (lng - geo.center[0]) * kx, y = (lat - geo.center[1]) * ky;
      return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
    };
    // Population cells linked to their nearest exposed facility (as in the twin's massing layer).
    const exposed = F.map((f, i) => (f.type !== 'weather' ? i : -1)).filter((i) => i >= 0);
    const cells = (geo.population ? geo.population.cells : []).map(([lng, lat, n]) => {
      let best = -1, bd = 1.6;
      for (const i of exposed) { const d = C.haversine([lng, lat], F[i].lngLat) / 1000; if (d < bd) { bd = d; best = i; } }
      return { p: local([lng, lat]), n, f: best, w: best < 0 ? 0 : Math.exp(-bd / 0.9) };
    });
    const nMax = cells.reduce((m, c) => Math.max(m, c.n), 1);
    const streets = geo.corridors.map((s) => ({ pts: s.g.map(local), c: s.c }));
    const rivers = geo.drainage.map((s) => ({ pts: s.g.map(local), m: s.m, f: s.i && s.i[0] ? s.i[0][0] : -1, w: s.i && s.i[0] ? s.i[0][1] : 0 }));
    const facs = F.map((f, i) => ({ i, p: local(f.lngLat), type: f.type, name: f.name, id: f.id, h: f.type === 'weather' ? 0 : 18 + (3 - f.tier) * 6 }));
    const districts = (geo.districts || []).map((d) => ({ name: d.name, p: local(d.lngLat) }));

    let W = 0, H = 0, dpr = 1, S = 1, ox = 0, oy = 0;
    let base = null; // static layer
    let R = new Float32Array(N).fill(0.12);
    let hover = -1, selected = -1, focusSet = null, highlightDistrict = null;
    const pulses = [], rings = [];
    let raf = 0, last = 0, running = false;

    const proj = (p, h = 0) => [ox + S * p[0], oy - S * p[1] * tilt - h];

    function fit() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(10, rect.width); H = Math.max(10, rect.height);
      dpr = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of cells) { x0 = Math.min(x0, c.p[0]); x1 = Math.max(x1, c.p[0]); y0 = Math.min(y0, c.p[1]); y1 = Math.max(y1, c.p[1]); }
      for (const f of facs) { x0 = Math.min(x0, f.p[0]); x1 = Math.max(x1, f.p[0]); y0 = Math.min(y0, f.p[1]); y1 = Math.max(y1, f.p[1]); }
      const pad = opts.pad || { l: 20, r: 20, t: 30, b: 20 };
      const sx = (W - pad.l - pad.r) / (x1 - x0), sy = (H - pad.t - pad.b) / ((y1 - y0) * tilt);
      S = Math.min(sx, sy) * (opts.zoom || 1);
      ox = pad.l + (W - pad.l - pad.r) / 2 - S * (x0 + x1) / 2 + (opts.shiftX || 0) * W;
      oy = pad.t + (H - pad.t - pad.b) / 2 + S * ((y0 + y1) / 2) * tilt + (opts.shiftY || 0) * H;
      drawBase();
    }

    function drawBase() {
      base = document.createElement('canvas');
      base.width = canvas.width; base.height = canvas.height;
      const g = base.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // ground plate
      if (!flat) {
        const grd = g.createRadialGradient(W * 0.62, H * 0.55, 10, W * 0.62, H * 0.55, Math.max(W, H) * 0.7);
        grd.addColorStop(0, 'rgba(121,167,227,0.07)'); grd.addColorStop(1, 'rgba(121,167,227,0)');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
      }
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const s of streets) {
        g.strokeStyle = s.c === 'trunk' ? 'rgba(170,190,215,0.16)' : s.c === 'primary' ? 'rgba(170,190,215,0.11)' : 'rgba(170,190,215,0.06)';
        g.lineWidth = s.c === 'trunk' ? 1.2 : 0.8;
        g.beginPath(); s.pts.forEach((p, q) => { const [x, y] = proj(p); q ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      }
      for (const r of rivers) {
        g.strokeStyle = r.m ? 'rgba(74,149,220,0.45)' : 'rgba(74,149,220,0.2)'; g.lineWidth = r.m ? 1.6 : 0.8;
        g.beginPath(); r.pts.forEach((p, q) => { const [x, y] = proj(p); q ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      }
      if (opts.labels !== false) {
        g.font = `600 ${flat ? 10 : 9}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-ui')}`;
        g.fillStyle = 'rgba(196,206,220,0.32)'; g.textAlign = 'center';
        for (const d of districts) { const [x, y] = proj(d.p); g.fillText(d.name.toUpperCase().split('').join(' '), x, y + (flat ? 0 : 14)); }
      }
    }

    // Cell colour: dim steel at rest, warming with the risk of the facility it depends on.
    function cellColor(c) {
      const r = c.f < 0 ? 0.1 : R[c.f] * c.w + 0.1 * (1 - c.w);
      if (r >= 0.75) return ['#e5484d', 0.95];
      if (r >= 0.55) return ['#ee8a2a', 0.85];
      if (r >= 0.35) return ['#e2b93b', 0.62];
      return [flat ? '#2a3a4c' : '#36506a', flat ? 0.75 : 0.55];
    }

    function frame(t) {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(base, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // River stress glow
      g.lineCap = 'round';
      for (const r of rivers) {
        if (r.f < 0) continue;
        const v = R[r.f] * Math.min(1, r.w * 1.3);
        if (v < 0.4) continue;
        g.strokeStyle = v >= 0.75 ? `rgba(229,72,77,${0.25 + 0.5 * (v - 0.75) * 4})` : `rgba(120,190,255,${(v - 0.4) * 1.4})`;
        g.lineWidth = r.m ? 3.2 : 1.8;
        g.beginPath(); r.pts.forEach((p, q) => { const [x, y] = proj(p); q ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      }
      // Population columns (back to front) or flat cells
      const cw = Math.max(1.6, S * (flat ? 0.4 : 0.2));
      for (const c of cells) {
        const [x, y] = proj(c.p);
        const [col, a] = cellColor(c);
        const dimmed = focusSet && !(c.f >= 0 && focusSet.has(c.f));
        g.globalAlpha = dimmed ? a * 0.25 : a;
        g.fillStyle = col;
        if (flat) { g.fillRect(x - cw / 2, y - cw / 2, cw * 0.86, cw * 0.86); continue; }
        const h = 2 + 44 * Math.pow(c.n / nMax, 0.62) * (S / 34);
        g.fillRect(x - cw / 2, y - h, cw, h);
        g.globalAlpha = Math.min(1, a + 0.25);
        g.fillRect(x - cw / 2, y - h - 1, cw, 1.4);
      }
      g.globalAlpha = 1;
      if (highlightDistrict) {
        const [x, y] = proj(highlightDistrict.p);
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.4; g.setLineDash([4, 3]);
        g.beginPath(); g.ellipse(x, y, S * 1.1, S * 1.1 * tilt, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      // Pulses travelling along links
      for (let q = pulses.length - 1; q >= 0; q--) {
        const p = pulses[q];
        p.age += dt;
        if (p.age < 0) continue;
        const u = p.age / p.dur;
        if (u >= 1) { pulses.splice(q, 1); if (p.onArrive) p.onArrive(); continue; }
        const a = facs[p.from], b = facs[p.to];
        const [x0, y0] = proj(a.p, a.h), [x1, y1] = proj(b.p, b.h);
        const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * 0.22;
        const bez = (s) => [(1 - s) * (1 - s) * x0 + 2 * (1 - s) * s * mx + s * s * x1, (1 - s) * (1 - s) * y0 + 2 * (1 - s) * s * my + s * s * y1];
        g.strokeStyle = p.color; g.lineWidth = 1.2; g.globalAlpha = 0.18 + 0.25 * Math.sin(Math.PI * u);
        g.beginPath(); for (let s = 0; s <= 1.0001; s += 0.05) { const [x, y] = bez(s); s ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        g.globalAlpha = 1;
        for (let k = 0; k < 4; k++) {
          const s = u - k * 0.035;
          if (s < 0) continue;
          const [x, y] = bez(s);
          g.fillStyle = p.color; g.globalAlpha = 1 - k * 0.24;
          g.beginPath(); g.arc(x, y, 2.6 - k * 0.45, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
      }
      // Facilities
      for (const f of facs) {
        if (f.type === 'weather' && !flat) continue;
        const [x, y0] = proj(f.p);
        const y = y0 - (flat ? 0 : f.h);
        const k = stateKey(R[f.i]);
        const col = HEX[k];
        const dim = focusSet && !focusSet.has(f.i);
        g.globalAlpha = dim ? 0.25 : 1;
        if (!flat) { g.strokeStyle = col; g.globalAlpha *= 0.55; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y + 5); g.stroke(); g.globalAlpha = dim ? 0.25 : 1; }
        if (k === 'critical' && !dim) {
          const pulse = 0.5 + 0.5 * Math.sin(t / 260 + f.i);
          g.fillStyle = `rgba(229,72,77,${0.12 + 0.18 * pulse})`; g.beginPath(); g.arc(x, y, 9 + 4 * pulse, 0, Math.PI * 2); g.fill();
        }
        const r = f.i === hover || f.i === selected ? 6.5 : 5;
        g.beginPath();
        for (let a = 0; a < 6; a++) { const th = Math.PI / 6 + (a * Math.PI) / 3; const px = x + r * Math.cos(th), py = y + r * Math.sin(th); a ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.closePath();
        g.fillStyle = k === 'normal' ? 'rgba(10,12,15,0.92)' : 'rgba(30,12,14,0.92)'; g.fill();
        g.strokeStyle = f.i === selected ? '#fff' : col; g.lineWidth = 1.5; g.stroke();
        g.globalAlpha = 1;
      }
      // Rings when a facility changes state
      for (let q = rings.length - 1; q >= 0; q--) {
        const r = rings[q]; r.age += dt;
        if (r.age > r.dur) { rings.splice(q, 1); continue; }
        const f = facs[r.i], [x, y0] = proj(f.p), y = y0 - (flat ? 0 : f.h), u = r.age / r.dur;
        g.strokeStyle = r.color; g.globalAlpha = 1 - u; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(x, y, 8 + 34 * u, (8 + 34 * u) * (flat ? 1 : 0.6), 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
      // Hover label
      if (hover >= 0) {
        const f = facs[hover], [x, y0] = proj(f.p), y = y0 - (flat ? 0 : f.h);
        const txt = `${f.name}`, sub = `${Math.round(R[hover] * 100)}% · ${stateKey(R[hover]).toUpperCase()}`;
        g.font = `500 12px ${getComputedStyle(document.documentElement).getPropertyValue('--font-ui')}`;
        const w = Math.max(g.measureText(txt).width, 90) + 18;
        const bx = Math.min(W - w - 8, x + 12), by = Math.max(8, y - 44);
        g.fillStyle = 'rgba(10,12,15,0.94)'; g.strokeStyle = 'rgba(220,230,245,0.18)'; g.lineWidth = 1;
        g.beginPath(); g.roundRect ? g.roundRect(bx, by, w, 38, 4) : g.rect(bx, by, w, 38); g.fill(); g.stroke();
        g.fillStyle = '#e4e8ee'; g.textAlign = 'left'; g.fillText(txt, bx + 9, by + 16);
        g.font = `500 10.5px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono')}`;
        g.fillStyle = HEX[stateKey(R[hover])]; g.fillText(sub, bx + 9, by + 30);
      }
      if (running) raf = requestAnimationFrame(frame);
    }

    function nearestFac(mx, my) {
      let best = -1, bd = 16;
      for (const f of facs) {
        if (f.type === 'weather' && !flat) continue;
        const [x, y0] = proj(f.p), y = y0 - (flat ? 0 : f.h);
        const d = Math.hypot(mx - x, my - y);
        if (d < bd) { bd = d; best = f.i; }
      }
      return best;
    }
    function nearestDistrict(mx, my) {
      let best = null, bd = Infinity;
      for (const d of districts) { const [x, y] = proj(d.p); const dd = Math.hypot(mx - x, my - y); if (dd < bd) { bd = dd; best = d; } }
      return best;
    }
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      hover = nearestFac(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = hover >= 0 || opts.onPickDistrict ? 'pointer' : 'default';
      if (!running) frame(performance.now());
    });
    canvas.addEventListener('pointerleave', () => { hover = -1; if (!running) frame(performance.now()); });
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const i = nearestFac(mx, my);
      if (i >= 0 && opts.onPick) opts.onPick(i);
      else if (opts.onPickDistrict) { const d = nearestDistrict(mx, my); if (d) opts.onPickDistrict(d.name); }
    });

    const ro = new ResizeObserver(() => { fit(); if (!running) frame(performance.now()); });
    ro.observe(canvas);
    fit();

    return {
      setRisk(arr) { R = arr; if (!running) frame(performance.now()); },
      pulse(from, to, { delay = 0, dur = 1.1, kind = 'cascade', onArrive } = {}) { pulses.push({ from, to, age: -delay, dur, color: FLOW[kind] || kind, onArrive }); },
      ring(i, color, dur = 1.2) { rings.push({ i, color, age: 0, dur }); },
      select(i) { selected = i; if (!running) frame(performance.now()); },
      focus(set) { focusSet = set; if (!running) frame(performance.now()); },
      highlight(name) { highlightDistrict = name ? districts.find((d) => d.name.toLowerCase() === name.toLowerCase()) || null : null; if (!running) frame(performance.now()); },
      start() { if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); } },
      stop() { running = false; cancelAnimationFrame(raf); },
      districts: () => districts.map((d) => d.name),
      FLOW, HEX, stateKey,
    };
  }

  root.CITYCANVAS = { create, HEX, FLOW, stateKey };
})(window);
