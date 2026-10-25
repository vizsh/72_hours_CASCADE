/* My area: a plain-language forecast for one neighbourhood. */
(function () {
  const S = window.SITE, { $, $$, esc } = S;
  S.chrome('citizen');
  const C = window.TWIN.core;
  const geo = window.TWIN_GEOS.nagpur, F = geo.facilities;
  const title = (s) => s.toLowerCase().replace(/(^|[\s/(-])\w/g, (m) => m.toUpperCase());
  const areas = geo.districts.map((d) => ({ name: title(d.name), raw: d.name, lngLat: d.lngLat }));
  const params = new URLSearchParams(location.search);
  let scen = params.get('scenario') || 'monsoon2023', area = areas.find((a) => a.name.toLowerCase() === (params.get('area') || '').toLowerCase()) || areas.find((a) => a.raw === 'DHARAMPETH') || areas[0];
  let h = 0, lang = 'en', snap = null, adv = null;
  const FAMILY = {
    flood: 'Flooding', grid: 'Power cuts', comms: 'Mobile network disruption', toxic: 'Gas exposure', crowd: 'Dangerous crowding', gridlock: 'Severe traffic disruption', health: 'Hospitals under strain',
  };
  const familyOf = (sys) => {
    if (scen === 'chlorine' && ['traffic', 'ems', 'hospital'].includes(sys)) return 'toxic';
    if (scen === 'festival' && ['traffic', 'ems'].includes(sys)) return 'crowd';
    return { drainage: 'flood', power: 'grid', telecom: 'comms', traffic: 'gridlock', ems: 'health', hospital: 'health' }[sys] || 'flood';
  };
  const sysOf = (f) => (f.type === 'telecom' ? 'telecom' : f.subtype === 'EMS station' ? 'ems' : f.type);

  $('#cAreas').innerHTML = areas.map((a) => `<option value="${esc(a.name)}">`).join('');
  $('#cArea').value = area.name;
  $('#cArea').addEventListener('change', () => { const a = areas.find((x) => x.name.toLowerCase() === $('#cArea').value.trim().toLowerCase()); if (a) choose(a); });
  const scenSel = $('#cScen');
  const list = Object.values(window.TWIN.scenarios).filter((s) => !s.cities || s.cities.includes('nagpur')).sort((a, b) => Number(!!b.cities) - Number(!!a.cities));
  scenSel.innerHTML = list.map((s) => `<option value="${s.id}" ${s.id === scen ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  scenSel.addEventListener('change', () => { scen = scenSel.value; load(); });
  $('#cH').addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (!b) return; h = +b.dataset.h; $$('#cH button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paint(); });

  const map = window.CITYCANVAS.create($('#cMap'), geo, { flat: true, pad: { l: 16, r: 16, t: 16, b: 16 }, onPickDistrict: (name) => { const a = areas.find((x) => x.raw === name); if (a) choose(a); }, onPick: (i) => { const f = F[i]; let best = areas[0], bd = Infinity; for (const a of areas) { const d = C.haversine(a.lngLat, f.lngLat); if (d < bd) { bd = d; best = a; } } choose(best); } });
  map.start();

  function choose(a) { area = a; $('#cArea').value = a.name; history.replaceState(null, '', `?area=${encodeURIComponent(a.name)}&scenario=${scen}`); paint(); }

  function load() {
    snap = null;
    $('#cCard').innerHTML = '<span class="status-line"><i class="led"></i>Running the forecast for Nagpur…</span>';
    Promise.all([S.call('snapshot', { city: 'nagpur', scen }), adv || S.call('advice', { city: 'nagpur' })]).then(([s, a]) => { snap = s; adv = a; paint(); })
      .catch((e) => { $('#cCard').innerHTML = `<span class="status-line err"><i class="led"></i>${esc(e.message)}</span>`; });
  }
  const at = (i, q) => snap.fc.mean[i * snap.fc.KF + Math.min(snap.fc.KF - 1, q)];

  function paint() {
    if (!snap) return;
    const q = Math.round(h / snap.DT), N = snap.N, kNow = snap.kLive;
    const R = new Float32Array(N);
    for (let i = 0; i < N; i++) R[i] = at(i, q);
    map.setRisk(R);
    map.highlight(area.raw);
    const asOf = S.clock(snap.t0, kNow * snap.DT, snap.tz);
    $('#cAsOf').textContent = `Forecast issued ${asOf.day} ${asOf.time} ${snap.tzLabel}`;
    // Facilities that serve this area: within 2.2 km, else the nearest three.
    let near = F.map((f, i) => ({ i, d: C.haversine(area.lngLat, f.lngLat) })).filter((x) => F[x.i].type !== 'weather').sort((a, b) => a.d - b.d);
    const close = near.filter((x) => x.d < 2200);
    near = close.length >= 3 ? close : near.slice(0, 3);
    const tNow = kNow * snap.DT;
    // Verdict
    const worstNow = near.reduce((b, x) => (at(x.i, q) > at(b.i, q) ? x : b), near[0]);
    const rNow = at(worstNow.i, q);
    // The scenario's primary hazard leads (a flood that also strains hospitals is a flood warning).
    const PRI = { chlorine: ['traffic', 'ems', 'hospital'], festival: ['traffic', 'ems', 'drainage'], blackout: ['power', 'telecom'], heat: ['power', 'hospital'] }[scen] || ['drainage', 'traffic', 'power'];
    const rank = (x) => { const r = PRI.indexOf(sysOf(F[x.i])); return r < 0 ? 9 : r; };
    const likely = near.map((x) => ({ ...x, tt: snap.fc.ttc[x.i] })).filter((x) => x.tt.p24 >= 0.4 && x.tt.median != null).sort((a, b) => rank(a) - rank(b) || a.tt.median - b.tt.median)[0];
    let headline, sub, fam, tone;
    if (rNow >= 0.55) {
      fam = familyOf(sysOf(F[worstNow.i])); tone = rNow >= 0.75 ? 'critical' : 'high';
      headline = `${FAMILY[fam]} in ${area.name} ${h ? 'expected in ' + h + ' hours' : 'now'}.`;
      sub = `${F[worstNow.i].name} is forecast at ${Math.round(rNow * 100)}%, ${tone === 'critical' ? 'CRITICAL' : 'HIGH RISK'}.`;
    } else if (likely) {
      fam = familyOf(sysOf(F[likely.i])); tone = 'watch';
      const c = S.clock(snap.t0, tNow + likely.tt.median, snap.tz);
      headline = `${FAMILY[fam]} likely in ${area.name} from about ${c.time} ${c.day.slice(0, 3) === asOf.day.slice(0, 3) ? 'today' : c.day.slice(0, 3)}.`;
      sub = `${S.pct(likely.tt.p24)} chance within 24 hours, starting at ${F[likely.i].name}. Likely window ${likely.tt.p10 != null ? S.clock(snap.t0, tNow + likely.tt.p10, snap.tz).time : '?'}–${likely.tt.p90 != null ? S.clock(snap.t0, tNow + likely.tt.p90, snap.tz).time : '?'}.`;
    } else {
      fam = null; tone = 'normal';
      headline = `No serious disruption expected in ${area.name} in the next 24 hours.`;
      sub = 'The forecast is checked again every 30 minutes as new readings arrive.';
    }
    // Ribbon: worst forecast per system over the next 36 h
    const steps = Math.min(snap.fc.KF, 72);
    const bySys = {};
    near.forEach((x) => { const s = sysOf(F[x.i]); (bySys[s] ||= []).push(x.i); });
    const order = ['drainage', 'traffic', 'power', 'telecom', 'ems', 'hospital'].filter((s) => bySys[s]);
    const ribbon = order.map((s) => {
      let cells = '';
      for (let qq = 0; qq < steps; qq++) { const r = Math.max(...bySys[s].map((i) => at(i, qq))); cells += `<i style="background:${C.RISK_HEX[C.stateOf(r).key]};opacity:${0.25 + 0.75 * Math.min(1, r / 0.8)}"></i>`; }
      return `<div class="rib-row"><span>${S.SYS[s].label}</span><span class="rib-cells" style="--n:${steps}">${cells}</span></div>`;
    }).join('');
    const ticks = [0, 12, 24, 36].filter((x) => x / snap.DT < steps).map((x) => `<span style="left:${(x / snap.DT / steps) * 100}%">${S.clock(snap.t0, tNow + x, snap.tz).time}</span>`).join('');
    // Hospital and roads
    const hosp = F.map((f, i) => ({ f, i, d: C.haversine(area.lngLat, f.lngLat) })).filter((x) => x.f.type === 'hospital' && x.f.subtype !== 'EMS station').sort((a, b) => a.d - b.d)[0];
    const hState = (qq) => { const r = at(hosp.i, qq); return `<span class="pill r-${C.stateOf(r).key}">${C.stateOf(r).label}</span>`; };
    const roads = near.filter((x) => sysOf(F[x.i]) === 'traffic').map((x) => { let first = -1; for (let qq = 0; qq < Math.min(snap.fc.KF, 24); qq++) if (at(x.i, qq) >= 0.55) { first = qq; break; } return { ...x, first }; }).filter((x) => x.first >= 0);
    // Advice in the chosen language
    const langs = adv.langs;
    const famUse = fam || 'flood';
    const [advHead, advText] = adv.txt[lang][famUse];
    $('#cCard').innerHTML = `
      <div class="cc-verdict r-${tone}"><span class="cc-dot"></span><div><h2 class="h2">${esc(headline)}</h2><p>${esc(sub)}</p></div></div>
      <div class="cc-sec"><div class="cc-sec-head"><span class="label">Next 36 hours near you</span><span class="legend-inline"><span><i class="box" style="background:#3fb27f"></i>normal</span><span><i class="box" style="background:#e2b93b"></i>watch</span><span><i class="box" style="background:#ee8a2a"></i>high</span><span><i class="box" style="background:#e5484d"></i>critical</span></span></div>
        <div class="ribbon">${ribbon}<div class="rib-axis">${ticks}</div></div></div>
      <div class="cc-sec cc-advice"><div class="cc-sec-head"><span class="label">${fam ? 'What to do now' : 'If conditions change'}</span>
        <div class="seg" id="cLang">${langs.map((l, n) => `<button type="button" data-l="${l}" aria-pressed="${l === lang}">${esc(adv.names[n])}</button>`).join('')}</div></div>
        <p class="cc-advice-text" lang="${lang}"><b>${esc(advHead)}.</b> ${esc(advText)}</p></div>
      <div class="cc-grid">
        <div class="cc-sec"><span class="label">Nearest hospital</span><h3 class="h3">${esc(hosp.f.name)}</h3><p class="dim">${(hosp.d / 1000).toFixed(1)} km away</p>
          <div class="cc-hosp"><span>Now</span>${hState(0)}<span>+6 h</span>${hState(12)}<span>+12 h</span>${hState(24)}</div></div>
        <div class="cc-sec"><span class="label">Roads to avoid</span>${roads.length ? `<ul class="cc-roads">${roads.map((x) => `<li><b>${esc(F[x.i].name)}</b><span class="mono">from ${S.clock(snap.t0, tNow + x.first * snap.DT, snap.tz).time}</span></li>`).join('')}</ul>` : '<p class="dim">No junction near you is forecast to jam in the next 12 hours.</p>'}</div>
      </div>
      <div class="cc-links"><a class="text-link" href="twin.html?scenario=${scen}&select=${encodeURIComponent(F[worstNow.i].id)}">See ${esc(F[worstNow.i].name)} in the operations room →</a></div>`;
    $('#cLang').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) { lang = b.dataset.l; paint(); } });
  }
  load();
})();
