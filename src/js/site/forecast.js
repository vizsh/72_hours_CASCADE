/* Live: the GFS ensemble for any city, straight from Open-Meteo. */
(function () {
  const S = window.SITE, { $, esc } = S;
  S.chrome('live');
  const QUICK = [
    { name: 'Nagpur', admin: 'Maharashtra', latitude: 21.142, longitude: 79.086, twin: 'nagpur' },
    { name: 'Raleigh', admin: 'North Carolina', latitude: 35.78, longitude: -78.64, twin: 'raleigh' },
    { name: 'Mumbai', admin: 'Maharashtra', latitude: 19.076, longitude: 72.877 },
    { name: 'Guwahati', admin: 'Assam', latitude: 26.144, longitude: 91.736 },
    { name: 'Chennai', admin: 'Tamil Nadu', latitude: 13.083, longitude: 80.27 },
  ];
  $('#wQuick').innerHTML = QUICK.map((c, n) => `<button class="chip" type="button" data-n="${n}" aria-pressed="${n === 0}">${esc(c.name)}</button>`).join('');
  $('#wQuick').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) go(QUICK[+b.dataset.n]); });

  // City search (Open-Meteo geocoding)
  let sugTimer = 0, sugs = [];
  const input = $('#wCity'), box = $('#wSug');
  input.addEventListener('input', () => {
    clearTimeout(sugTimer);
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    sugTimer = setTimeout(() => fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`)
      .then((r) => r.json()).then((d) => {
        sugs = (d.results || []).map((r) => ({ name: r.name, admin: [r.admin1, r.country].filter(Boolean).join(', '), latitude: r.latitude, longitude: r.longitude }));
        box.innerHTML = sugs.map((s, n) => `<button type="button" role="option" data-n="${n}"><b>${esc(s.name)}</b><span>${esc(s.admin)}</span></button>`).join('') || '<div class="live-none">No city found by that name.</div>';
        box.hidden = false;
      }).catch(() => { box.innerHTML = '<div class="live-none">City search needs an internet connection.</div>'; box.hidden = false; }), 250);
  });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (!b) return; const c = sugs[+b.dataset.n]; box.hidden = true; input.value = c.name; go(c); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && sugs[0] && !box.hidden) { box.hidden = true; input.value = sugs[0].name; go(sugs[0]); } if (e.key === 'Escape') box.hidden = true; });
  document.addEventListener('click', (e) => { if (!e.target.closest('.live-in')) box.hidden = true; });

  let token = 0;
  function go(city) {
    const t = ++token;
    document.querySelectorAll('#wQuick .chip').forEach((b) => b.setAttribute('aria-pressed', String(QUICK[+b.dataset.n].name === city.name)));
    $('#wSummary').innerHTML = `<span class="status-line"><i class="led"></i>Fetching 31 ensemble members for ${esc(city.name)}…</span>`;
    const q = new URLSearchParams({ latitude: city.latitude.toFixed(3), longitude: city.longitude.toFixed(3), hourly: 'precipitation,temperature_2m,wind_speed_10m', models: 'gfs025', past_days: '1', forecast_days: '3', timezone: 'auto' });
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    fetch(`https://ensemble-api.open-meteo.com/v1/ensemble?${q}`, { signal: ctl.signal }).then((r) => { if (!r.ok) throw new Error('Open-Meteo returned HTTP ' + r.status); return r.json(); })
      .then((d) => { clearTimeout(timer); if (t === token) render(city, d); })
      .catch((err) => {
        if (t !== token) return;
        $('#wSummary').innerHTML = `<p class="live-err"><b>Could not reach Open-Meteo</b> (${esc(err.name === 'AbortError' ? 'timed out' : err.message)}). This page needs an internet connection; the replay scenarios in the operations room work offline.</p>`;
      });
  }

  const cols = (H, name) => Object.keys(H).filter((k) => k === name || k.startsWith(name + '_member')).sort().map((k) => H[k].map((v) => (v == null ? 0 : v)));
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

  function render(city, d) {
    const H = d.hourly, P = cols(H, 'precipitation'), T = cols(H, 'temperature_2m'), Wd = cols(H, 'wind_speed_10m');
    const n = H.time.length, M = P.length;
    const off = d.utc_offset_seconds || 0;
    const localNow = new Date(Date.now() + off * 1000).toISOString().slice(0, 13) + ':00';
    let iNow = H.time.indexOf(localNow); if (iNow < 0) iNow = 24;
    const i0 = Math.max(0, iNow - 12), i1 = Math.min(n, iNow + 60);
    const hours = Array.from({ length: i1 - i0 }, (_, j) => j - (iNow - i0)); // hours from now
    const at = (cols_, j) => cols_.map((c) => c[i0 + j]);
    const mean = hours.map((_, j) => at(P, j).reduce((s, v) => s + v, 0) / M);
    const p10 = hours.map((_, j) => q(at(P, j), 0.1)), p90 = hours.map((_, j) => q(at(P, j), 0.9));
    const heavy = hours.map((_, j) => at(P, j).filter((v) => v >= 5).length / M);
    const tMed = hours.map((_, j) => q(at(T, j), 0.5)), tLo = hours.map((_, j) => Math.min(...at(T, j))), tHi = hours.map((_, j) => Math.max(...at(T, j)));
    const wMed = hours.map((_, j) => q(at(Wd, j), 0.5)), wMax = hours.map((_, j) => Math.max(...at(Wd, j)));
    const fut = (arr) => arr.slice(iNow - i0, iNow - i0 + 48);
    const pHeavy = (() => { let c = 0; for (let m = 0; m < M; m++) { for (let j = iNow; j < Math.min(n, iNow + 48); j++) if (P[m][j] >= 5) { c++; break; } } return c / M; })();
    const peakJ = fut(heavy).indexOf(Math.max(...fut(heavy)));
    const tPeak = Math.max(...fut(tHi)), wPeak = Math.max(...fut(wMax));
    const fmtHour = (h) => { const st = H.time[iNow + h]; if (!st) return ''; const dd = new Date(st + ':00Z'); return st.slice(11, 16) + ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dd.getUTCDay()]; };
    const verdict = pHeavy >= 0.5 ? `Heavy rain is likely in ${city.name}` : pHeavy >= 0.15 ? `Heavy rain is possible in ${city.name}` : `No heavy rain expected in ${city.name}`;
    $('#wSummary').innerHTML = `<h2 class="h2">${esc(verdict)}.</h2>
      <p class="lede">${Math.round(pHeavy * 100)}% of the ${M} futures bring at least 5 mm/h in the next 48 hours${pHeavy > 0 && heavy[iNow - i0 + peakJ] > 0 ? `, most often around ${fmtHour(peakJ)}` : ''}. Hottest member ${tPeak.toFixed(0)}°C, strongest wind ${wPeak.toFixed(0)} km/h. ${esc(city.name)}${city.admin ? ', ' + esc(city.admin) : ''} · model run fetched ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>`;
    const xr = [hours[0], hours[hours.length - 1]], xt = [-12, 0, 12, 24, 36, 48, 60].filter((x) => x >= xr[0] && x <= xr[1]);
    const xf = (x) => (x === 0 ? 'now' : (x > 0 ? '+' : '') + x + 'h');
    const now = [{ x: 0, label: 'now', color: 'rgba(121,167,227,0.8)' }];
    const draw = () => {
      const rTop = Math.max(2, ...p90, ...P.map((c) => Math.max(...c.slice(i0, i1)))) * 1.08;
      const c = S.chart($('#wRain'), { height: 300, xr, yr: [0, rTop], yticks: [0, +(rTop / 2).toFixed(1), +rTop.toFixed(1)], yfmt: (v) => v.toFixed(1), xticks: xt, xfmt: xf,
        ribbons: [{ x0: hours[0], dx: 1, lo: p10, hi: p90, color: 'rgba(121,167,227,0.16)' }], series: [], marks: now });
      const g = c.g;
      for (const col of P) { g.strokeStyle = 'rgba(121,167,227,0.38)'; g.lineWidth = 0.9; g.beginPath(); hours.forEach((h, j) => { const x = c.X(h), y = c.Y(col[i0 + j]); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
      g.strokeStyle = '#e4e8ee'; g.lineWidth = 2; g.beginPath(); hours.forEach((h, j) => { const x = c.X(h), y = c.Y(mean[j]); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      const hb = S.chart($('#wHeavy'), { height: 180, xr, yr: [0, 1], yticks: [0, 0.5, 1], yfmt: (v) => Math.round(v * 100) + '%', xticks: xt, xfmt: xf, series: [], marks: now });
      const bw = Math.max(1, hb.X(1) - hb.X(0) - 1);
      heavy.forEach((v, j) => { if (!v) return; hb.g.fillStyle = v >= 0.5 ? '#e5484d' : v >= 0.2 ? '#ee8a2a' : '#79a7e3'; hb.g.fillRect(hb.X(hours[j]) - bw / 2, hb.Y(v), bw, hb.Y(0) - hb.Y(v)); });
      const tl = Math.floor(Math.min(...tLo) - 1), th = Math.ceil(Math.max(...tHi) + 1);
      S.chart($('#wTemp'), { height: 180, xr, yr: [tl, th], yticks: [tl, Math.round((tl + th) / 2), th], yfmt: (v) => v + '°', xticks: xt, xfmt: xf,
        ribbons: [{ x0: hours[0], dx: 1, lo: tLo, hi: tHi, color: 'rgba(238,138,42,0.22)' }], series: [{ y: tMed, x0: hours[0], dx: 1, color: '#ee8a2a', width: 1.8 }], marks: now });
      const wt = Math.ceil(Math.max(10, ...wMax) * 1.1);
      S.chart($('#wWind'), { height: 180, xr, yr: [0, wt], yticks: [0, Math.round(wt / 2), wt], yfmt: (v) => String(v), xticks: xt, xfmt: xf,
        series: [{ y: wMax, x0: hours[0], dx: 1, color: '#5fc8d6', width: 1.2, dash: [4, 3] }, { y: wMed, x0: hours[0], dx: 1, color: '#5fc8d6', width: 1.8, fill: '#5fc8d6', fillAlpha: 0.08 }], marks: now });
    };
    draw();
    if (!render.ro) { render.ro = new ResizeObserver(() => render.last && render.last()); render.ro.observe($('#wRain')); }
    render.last = draw;
    $('#wCta').innerHTML = city.twin
      ? `<div><h3 class="h3">Run this forecast through the ${esc(city.name)} twin</h3><p class="dim">The 31 members become the hazard prior for the 200-member ensemble; the twin then forecasts drains, roads, power, telecom and hospitals from it.</p></div><a class="btn primary" href="twin.html?scenario=live${city.twin === 'raleigh' ? '&city=raleigh' : ''}">Open the live twin →</a>`
      : `<div><h3 class="h3">The twin covers Nagpur and Raleigh</h3><p class="dim">Elsewhere you see the hazard layer only. Adding a city takes its OpenStreetMap extract and a facility list; see the README.</p></div><a class="btn" href="live.html" onclick="event.preventDefault();document.querySelector('#wQuick .chip').click()">Show Nagpur</a>`;
  }
  go(QUICK[0]);
})();
