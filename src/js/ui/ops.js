/* Operations drawers: crisis registry, red-team console, communications desk. */
(function (root) {
  const T = root.TWIN;
  const C = T.core;
  const { stateOf, RISK_HEX, fmtT } = C;
  const I = T.icons;
  const A = T.analytics;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));
  const pct = (x) => Math.round(x * 100) + '%';
  const STAGE_CLASS = { Precursor: 'r-watch', Emerging: 'r-high', Escalating: 'r-critical', Active: 'r-critical', Recovering: 'r-normal' };
  const SYS_ICON = { drainage: I.FAC.gauge, traffic: I.FAC.signal, power: I.FAC.power, telecom: I.FAC.telecom, ems: I.FAC.ems, hospital: I.FAC.hospital };
  const icon = (svg, px = 12) => svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
  // Re-render a drawer body without losing the reader's scroll position.
  function paint(body, html) { const y = body.scrollTop; body.innerHTML = html; body.scrollTop = y; }

  function shell(el, title, sub, extraHead = '') {
    el.innerHTML = `
      <div class="drawer-head"><h3><b>${title}</b>${sub}</h3>
        <div style="display:flex;gap:8px;align-items:center">${extraHead}<button class="icon-btn" data-close aria-label="Close">${I.UI.close}</button></div></div>
      <div class="drawer-body scroll"></div>`;
    return el.querySelector('.drawer-body');
  }

  // ── Crisis registry ────────────────────────────────────────────────────
  function createCrises(app) {
    const el = document.getElementById('drawerCrises');
    const body = shell(el, 'Crisis registry', 'Interacting cascades');
    el.querySelector('[data-close]').addEventListener('click', () => app.setDrawer(null));
    let focus = null;

    function render(force) {
      if (el.hidden) return;
      const v = app.view, e = app.engine;
      if (!force && body._k === v.kInfo && body._e === e) return;
      body._k = v.kInfo; body._e = e;
      const an = app.analytics();
      const cr = an.cascadeR(v.kInfo), X = an.crises(v.kInfo);
      const list = X.list, F = e.F;
      const totalPeople = list.reduce((s, c) => s + c.people, 0);
      const sysRows = X.systems.map((s) => {
        const b = cr.bySys[s] || { net: 0, haz: 0 };
        const tot = b.net + b.haz || 1;
        return `<div class="crr-row"><span>${A.SYS_LABEL[s]}</span><span class="crr-bar"><i class="net" style="width:${(b.net / tot) * 100}%"></i><i class="haz" style="width:${(b.haz / tot) * 100}%"></i></span><span class="mono faint">${b.net + b.haz > 0.01 ? pct(b.net / tot) : '–'}</span></div>`;
      }).join('');
      const cards = list.map((c, n) => {
        const st = stateOf(c.maxR).key;
        const chips = Object.entries(c.sys).map(([s, r]) => `<span class="sys-chip r-${stateOf(r).key}" title="${A.SYS_LABEL[s]} ${stateOf(r).label}">${icon(SYS_ICON[s] || I.FAC.weather, 11)}${A.SYS_LABEL[s]}</span>`).join('');
        return `<button class="crisis ${focus === c.id ? 'on' : ''}" data-n="${n}" style="--rc:${RISK_HEX[st]}">
          <span class="crisis-top"><span class="mono crisis-id">${c.id}</span><span class="pill ${STAGE_CLASS[c.stage]}">${c.stage}</span></span>
          <span class="crisis-type">${esc(c.type)} <span class="faint">· ${esc(c.districts.slice(0, 3).join(', '))}${c.districts.length > 3 ? ` +${c.districts.length - 3}` : ''}</span></span>
          <span class="crisis-chips">${chips}</span>
          <span class="crisis-meta mono">~${fmtK(c.people)} people · ${c.members.length} facilities · ${c.observed ? 'since ' + fmtT(c.since) : 'forecast ' + fmtT(c.since)}${c.nextCrit ? ` · next CRITICAL ${esc(F[c.nextCrit.i].id)} ${fmtT(c.nextCrit.t)} (${pct(c.nextCrit.prob)})` : ''}</span>
        </button>`;
      }).join('');
      const matrix = list.length ? `
        <table class="cx-matrix"><thead><tr><th></th>${X.systems.map((s) => `<th title="${A.SYS_LABEL[s]}">${icon(SYS_ICON[s], 12)}</th>`).join('')}</tr></thead>
        <tbody>${list.map((c, n) => `<tr data-n="${n}"><th class="mono">${c.id.slice(-4)}</th>${X.systems.map((s) => {
          const r = c.sys[s];
          if (r == null) return '<td class="cx-empty">·</td>';
          return `<td><i style="background:${RISK_HEX[stateOf(r).key]};opacity:${0.35 + 0.65 * r}"></i><span>${Math.round(r * 100)}</span></td>`;
        }).join('')}</tr>`).join('')}</tbody></table>` : '';
      const links = X.links.map((l) => {
        const a = list[l.from], b = list[l.to];
        if (l.kind === 'couples') {
          const ed = e.E[l.edge];
          return `<div class="cx-link"><span class="mono">${a.id.slice(-4)}</span><span class="cx-arrow">⟶</span><span class="mono">${b.id.slice(-4)}</span><span>can propagate via <b>${esc(F[ed.from].id)} → ${esc(F[ed.to].id)}</b>, lag ${l.lag} h, weight ${l.mean.toFixed(2)}</span></div>`;
        }
        return `<div class="cx-link contend"><span class="mono">${a.id.slice(-4)}</span><span class="cx-arrow">⨯</span><span class="mono">${b.id.slice(-4)}</span><span>both load <b>${esc(F[l.fac].name)}</b> · shared resource</span></div>`;
      }).join('');
      paint(body, `
        <div class="crr">
          <div class="crr-head"><div><div class="val-k">Cascade-R</div><div class="crr-v ${cr.r >= 1 ? 'bad' : cr.r >= 0.5 ? 'warn' : ''}">${cr.r.toFixed(2)}</div></div>
            <div class="crr-txt">${cr.r >= 1 ? 'Self-sustaining: more stress now moves through dependencies than arrives from the hazard.' : cr.r >= 0.5 ? 'Dependencies carry a growing share of the stress.' : 'Stress is mostly direct hazard impact.'}
            <span class="faint">Network-borne ${cr.net.toFixed(2)} vs hazard-borne ${cr.haz.toFixed(2)} (summed target units, ${fmtT(v.tInfo)}).</span>
            ${(() => { const x = an.crossing(v.kInfo); return x && !x.now ? `<span class="crr-cross">Forecast to cross 1.0 at <b>${fmtT(x.t)}</b>, in ${C.fmtDur(x.t - v.tInfo)}</span>` : !x ? '<span class="crr-cross">Not forecast to become self-sustaining within the horizon.</span>' : ''; })()}</div></div>
          <div class="crr-sys">${sysRows}</div>
          <div class="legend-row" style="margin-top:6px"><span><i style="border-color:var(--crit)"></i>through dependencies</span><span><i style="border-color:var(--text-3)"></i>direct hazard</span></div>
        </div>
        <div class="sec-head" style="margin-top:14px"><span class="sec-title"><b>${list.length}</b>crises · ${X.links.length} interactions · ~${fmtK(totalPeople)} people</span></div>
        <div class="crises">${cards || '<div class="empty">No facility is at or forecast to reach HIGH RISK within 24 h.</div>'}</div>
        ${list.length ? `<div class="sec-head" style="margin-top:14px"><span class="sec-title">Crisis × system</span><span class="caps">peak risk %</span></div>${matrix}` : ''}
        ${links ? `<div class="sec-head" style="margin-top:14px"><span class="sec-title">Interactions</span></div><div class="cx-links">${links}</div>` : ''}
        <div class="val-note">A crisis is a connected set of facilities at or forecast to reach HIGH RISK, joined where stress is flowing along a learned dependency now or is forecast to. Each keeps its own identity, type and stage; coupling and contention show where crises can merge or compete for the same hospital, substation or road.</div>`);
      body.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
        const c = list[+b.dataset.n];
        focus = focus === c.id ? null : c.id;
        app.focusCrisis(focus ? c : null);
        render(true);
      }));
    }
    return { render, focusId: () => focus, clearFocus: () => { focus = null; } };
  }

  // ── Red team ───────────────────────────────────────────────────────────
  function createRed(app) {
    const el = document.getElementById('drawerRed');
    const body = shell(el, 'Red team', 'Adversarial stream injection');
    el.querySelector('[data-close]').addEventListener('click', () => app.setDrawer(null));
    let chosen = new Set(['freeze', 'spike', 'bots']), onset = 6, busy = false, result = null, list = null, listFor = null;

    function render(force) {
      if (el.hidden) return;
      const clean = app.cleanEngine || app.engine;
      if (listFor !== clean) { list = T.redteam.attacks(clean); listFor = clean; result = null; }
      const v = app.view;
      if (!force && body._k === v.kInfo && body._e === app.engine) return;
      body._k = v.kInfo; body._e = app.engine;
      const tDec = v.tInfo, tA = Math.max(0.5, tDec - onset);
      paint(body, `
        <div class="acts">${list.map((a) => `<label class="act red"><input type="checkbox" data-id="${a.id}" ${chosen.has(a.id) ? 'checked' : ''}>
          <span class="act-name">${esc(a.label)}</span><span class="act-cost">${a.targets.length ? esc(a.targets.map((i) => clean.F[i].id).join(', ')) : 'all feeds'}</span>
          <span class="act-detail">${esc(a.detail)}</span></label>`).join('')}</div>
        <div class="budget" style="margin-top:10px"><span class="sec-title">Attack starts</span>
          <div class="seg" id="onsetSeg">${[12, 6, 3].map((h) => `<button data-h="${h}" aria-pressed="${h === onset}">${h} h before</button>`).join('')}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary-btn" id="redRun" ${busy || !chosen.size ? 'disabled' : ''}>${I.UI.bolt} ${busy ? 'Re-assimilating poisoned streams…' : `Launch at ${fmtT(tA)}`}</button>
          ${app.redTeam ? `<button class="btn" id="redRestore">${I.UI.reset} Restore clean streams</button>` : ''}
        </div>
        <div id="redOut"></div>
        <div class="val-note">The attacked twin is rebuilt from scratch on the poisoned streams and compared with the clean run as a control. Ground truth stays hidden from both and is used only for scoring. Decision time ${fmtT(tDec)}.</div>`);
      body.querySelector('.acts').addEventListener('change', (ev) => { const id = ev.target.dataset.id; if (!id) return; ev.target.checked ? chosen.add(id) : chosen.delete(id); render(true); });
      body.querySelector('#onsetSeg').addEventListener('click', (ev) => { const b = ev.target.closest('[data-h]'); if (b) { onset = +b.dataset.h; render(true); } });
      body.querySelector('#redRun').addEventListener('click', () => launch(tA, v.kInfo));
      const rs = body.querySelector('#redRestore'); if (rs) rs.addEventListener('click', () => { app.restoreClean(); result = null; render(true); });
      drawResult();
    }

    function launch(tA, kNow) {
      if (busy) return;
      busy = true; render(true);
      setTimeout(() => {
        const clean = app.cleanEngine || app.engine;
        const ids = [...chosen];
        const script = T.redteam.merge(list, ids, tA);
        const att = T.engine.create(app.geo, { scenario: app.state.scenario, script });
        result = { ids, tA, kNow, att, s: T.redteam.score(clean, att, list, ids, tA, kNow) };
        busy = false; render(true);
      }, 40);
    }

    function drawResult() {
      const out = body.querySelector('#redOut');
      if (!result) { out.innerHTML = ''; return; }
      const s = result.s, F = (app.cleanEngine || app.engine).F;
      const rows = s.rows.map((r) => {
        if (r.kind === 'sensor' && (r.masked || r.harmless)) return `<div class="rt-row">
          <div class="rt-head"><b>${esc(r.a.label)}</b><span class="mono">${esc(F[r.i].id)}</span><span class="pill ${r.masked ? 'r-watch' : 'r-normal'}">${r.masked ? 'masked' : 'no effect'}</span></div>
          <div class="rt-note">${r.masked ? 'The feed was dark for the whole window (blackout), so the injection never reached the twin.' : `The injected reading stayed within ${Math.round(r.dev * 100)} points of reality, so there was nothing to detect and nothing moved.`}</div></div>`;
        if (r.kind === 'sensor') return `<div class="rt-row">
          <div class="rt-head"><b>${esc(r.a.label)}</b><span class="mono">${esc(F[r.i].id)}</span><span class="pill ${r.flaggedAfter != null ? 'r-normal' : 'r-critical'}">${r.flaggedAfter != null ? `flagged in ${C.fmtDur(Math.max(0.5, r.flaggedAfter))}` : 'not flagged'}</span></div>
          <div class="rt-bars">${bar('Raw feed', r.raw, r.truth)}${bar('Twin (attacked)', r.twin, r.truth)}${bar('Twin (control)', r.control, r.truth)}<div class="rt-truth-lane"><div class="rt-truth" style="left:${r.truth * 100}%"><span>truth ${pct(r.truth)}</span></div></div></div>
          <div class="rt-note">At ${fmtT(r.kStar * (app.engine.DT))}, the worst moment of the injection. Trust in this feed now ${pct(r.trustNow)}.</div></div>`;
        if (r.kind === 'reports') return `<div class="rt-row">
          <div class="rt-head"><b>${esc(r.a.label)}</b><span class="mono">${r.n} posts</span><span class="pill ${r.held === r.n ? 'r-normal' : 'r-high'}">${r.held} of ${r.n} held</span></div>
          <div class="rt-note">Median corroboration ${pct(r.median)}, scored against the severity each post claims. ${r.held === r.n ? 'The twin\'s own estimate at those places does not support the claims, so none raised an alert or moved the forecast.' : `${r.n - r.held} land where the twin really does show CRITICAL, so they are plausible and go to field verification; reports never drive the forecast directly.`}</div></div>`;
        return `<div class="rt-row">
          <div class="rt-head"><b>${esc(r.a.label)}</b><span class="mono">${r.dark} of ${r.total} feeds dark</span><span class="pill r-watch">degraded</span></div>
          <div class="rt-note">Effective ensemble size ${Math.round(r.essClean)} → ${Math.round(r.essAtt)}. With feeds missing the twin falls back on the dependency model, so the nowcast widens rather than goes blind.</div></div>`;
      }).join('');
      out.innerHTML = `<div class="outcome">
        <div class="sec-head" style="margin:0"><span class="sec-title">Attack outcome · ${result.ids.length} injection${result.ids.length > 1 ? 's' : ''} from ${fmtT(result.tA)}</span>
          ${(() => { const bad = s.extraAlerts.length + s.delayedAlerts.length; const ok = bad === 0 && s.maeAtt - s.maeClean < 0.03; return `<span class="pill ${ok ? 'r-normal' : bad <= 1 ? 'r-watch' : 'r-high'}">${ok ? 'Contained' : bad <= 1 ? 'Partly absorbed' : 'Degraded'}</span>`; })()}</div>
        <div class="outcome-grid four">
          <div><div class="k">Sensors flagged</div><div class="v">${s.detected}/${s.sensors}</div><div class="d">by trust model</div></div>
          <div><div class="k">Nowcast error</div><div class="v">${s.maeAtt.toFixed(3)}</div><div class="d ${s.maeAtt - s.maeClean < 0.02 ? 'good' : 'bad'}">control ${s.maeClean.toFixed(3)}</div></div>
          <div><div class="k">Max shift</div><div class="v">${Math.round(s.maxShift * 100)} pts</div><div class="d">vs control at ${fmtT(result.kNow * app.engine.DT)}</div></div>
          <div><div class="k">Alerts</div><div class="v">${s.extraAlerts.length} <small class="faint">false</small></div><div class="d ${s.extraAlerts.length || s.delayedAlerts.length ? 'bad' : 'good'}">${s.delayedAlerts.length ? `${s.delayedAlerts.length} delayed` : 'none delayed'}${s.extraAlerts.length ? ' · ' + esc(s.extraAlerts.slice(0, 2).map((a) => F[a.i].id).join(', ')) : ''}</div></div>
        </div>
        <div class="rt-rows">${rows}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          ${app.redTeam ? '' : `<button class="btn" id="redShow">${I.UI.graph} Show attacked twin on the map</button>`}
        </div></div>`;
      const sh = out.querySelector('#redShow');
      if (sh) sh.addEventListener('click', () => app.useRedTeam(result.att, result.ids.map((id) => list.find((a) => a.id === id).label)));
    }
    function bar(label, val, truth) {
      const err = Math.abs(val - truth);
      return `<div class="rt-bar"><span>${label}</span><span class="rt-track"><i style="width:${Math.max(1, val * 100)}%;background:${RISK_HEX[stateOf(val).key]}"></i></span><span class="mono ${err > 0.15 ? 'bad' : err > 0.07 ? 'warn' : 'good'}">${pct(val)}</span></div>`;
    }
    return { render, reset: () => { result = null; } };
  }

  // ── Communications ─────────────────────────────────────────────────────
  function createComms(app) {
    const el = document.getElementById('drawerComms');
    const body = shell(el, 'Communications', 'Issued from the twin',
      `<div class="seg" role="group" id="commsTabs"><button data-tab="sitrep" aria-pressed="true">SITREP</button><button data-tab="cap" aria-pressed="false">CAP 1.2</button><button data-tab="sms" aria-pressed="false">Public alerts</button></div>`);
    el.querySelector('[data-close]').addEventListener('click', () => app.setDrawer(null));
    let tab = 'sitrep', capSel = 0, lang = 'all';
    const planCache = new Map();
    el.querySelector('#commsTabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]'); if (!b) return;
      tab = b.dataset.tab;
      el.querySelectorAll('#commsTabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render(true);
    });

    // Recommended plan at k: the planner drawer's selection if the user made one, otherwise
    // the planner's own recommendation within 5 crews. Computed after first paint.
    function planAt(k) {
      const mine = app.plan.current && app.plan.current();
      if (mine && mine.k === k && mine.ids.length) return mine;
      const key = app.engine.scen.id + '|' + k + '|' + (app.redTeam ? 'r' : 'c');
      if (planCache.has(key)) return planCache.get(key);
      return null;
    }
    function computePlan(k) {
      const key = app.engine.scen.id + '|' + k + '|' + (app.redTeam ? 'r' : 'c');
      if (planCache.has(key)) return;
      const pl = T.interventions.create(app.engine);
      const ids = pl.recommend(k, 5);
      const res = ids.length ? pl.evaluate(k, ids) : null;
      planCache.set(key, { k, ids, result: res, deadline: ids.length ? pl.deadline(k, ids, 16, 2) : null, catalog: pl.CATALOG });
    }

    function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    function copy(text, btn) {
      const done = () => { const o = btn.innerHTML; btn.innerHTML = `${I.UI.check} Copied`; setTimeout(() => (btn.innerHTML = o), 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
    }
    const fileStamp = (e, k) => T.comms.isoAt(e.t0, k * e.DT, e.geo.tz).slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

    function render(force) {
      if (el.hidden) return;
      const v = app.view, e = app.engine, k = v.kInfo;
      if (!force && body._k === k && body._t === tab && body._e === e) return;
      body._k = k; body._t = tab; body._e = e;
      const an = app.analytics();
      const crises = an.crises(k), cr = an.cascadeR(k);
      if (tab === 'sitrep') {
        const plan = planAt(k);
        const text = T.comms.sitrep(app, e, k, {
          number: `No. ${Math.floor((k * e.DT) / 3) + 1}`, cr, crises, people: app.layers.peopleAtRisk(e.stateAt(k).risk), plan, redTeam: !!app.redTeam,
        });
        paint(body, `
          <div class="doc-bar"><span class="caps">Situation report · ${fmtT(k * e.DT)}${plan ? '' : ' · computing actions…'}</span>
            <span style="display:flex;gap:6px"><button class="btn sm" id="cpy">Copy</button><button class="btn sm" id="dl">Download .txt</button></span></div>
          <pre class="doc">${esc(text)}</pre>`);
        body.querySelector('#cpy').addEventListener('click', (ev) => copy(text, ev.currentTarget));
        body.querySelector('#dl').addEventListener('click', () => download(`SITREP-${e.geo.id}-${fileStamp(e, k)}.txt`, text, 'text/plain'));
        if (!plan) setTimeout(() => { if (app.view.kInfo !== k || app.engine !== e) return; computePlan(k); render(true); }, 60);
        return;
      }
      if (!crises.list.length) { body.innerHTML = '<div class="empty">No active or forecast crises at this time, so there is nothing to issue.</div>'; return; }
      if (tab === 'cap') {
        capSel = Math.min(capSel, crises.list.length - 1);
        const c = crises.list[capSel];
        const xml = T.comms.cap(app, e, c, k, { cascadeR: cr.r });
        const g = T.comms.grade(c, k * e.DT);
        const nPoly = (xml.match(/<polygon>([^<]*)<\/polygon>/) || ['', ''])[1].split(' ').length;
        const langs = T.comms.cityCfg(e.geo).langs;
        paint(body, `
          <div class="doc-bar"><select class="glass sm-select" id="capSel" aria-label="Crisis">${crises.list.map((x, n) => `<option value="${n}" ${n === capSel ? 'selected' : ''}>${x.id} · ${esc(x.type)}</option>`).join('')}</select>
            <span style="display:flex;gap:6px"><button class="btn sm" id="cpy">Copy</button><button class="btn sm" id="dl">Download .xml</button></span></div>
          <div class="cap-check">
            <span><b>${g.severity}</b>severity</span><span><b>${g.urgency}</b>urgency</span><span><b>${g.certainty}</b>certainty</span>
            <span><b>${langs.length}</b>info blocks (${langs.map((l) => T.comms.LANG_NAME[l]).join(', ')})</span><span><b>${nPoly - 1}</b>vertex polygon, closed</span>
          </div>
          <pre class="doc xml">${highlight(xml)}</pre>
          <div class="val-note">OASIS CAP 1.2. Status is <span class="mono">Exercise</span> because the streams are replayed; the same document goes to a CAP gateway, a cell-broadcast centre or a siren controller unchanged.</div>`);
        body.querySelector('#capSel').addEventListener('change', (ev) => { capSel = +ev.target.value; render(true); });
        body.querySelector('#cpy').addEventListener('click', (ev) => copy(xml, ev.currentTarget));
        body.querySelector('#dl').addEventListener('click', () => download(`CAP-${c.id}-${fileStamp(e, k)}.xml`, xml, 'application/xml'));
        return;
      }
      const langs = T.comms.cityCfg(e.geo).langs;
      const show = lang === 'all' ? langs : [lang];
      paint(body, `
        <div class="doc-bar"><div class="seg" id="langSeg">${['all', ...langs].map((l) => `<button data-l="${l}" aria-pressed="${l === lang}">${l === 'all' ? 'All' : T.comms.LANG_NAME[l]}</button>`).join('')}</div>
          <span class="caps">${crises.list.length} crisis area${crises.list.length > 1 ? 's' : ''}</span></div>
        ${crises.list.map((c) => `<div class="sms-card" style="--rc:${RISK_HEX[stateOf(c.maxR).key]}">
          <div class="sms-head"><span class="mono">${c.id}</span><span>${esc(c.type)}</span><span class="faint">~${fmtK(c.people)} recipients</span></div>
          ${show.map((l) => { const m = T.comms.sms(e.geo, e.t0, c, k * e.DT, l); return `<div class="sms" lang="${l}"><div class="sms-text">${esc(m.text)}</div>
            <div class="sms-meta mono">${T.comms.LANG_NAME[l]} · ${m.encoding} · ${m.chars} chars · ${m.segments} segment${m.segments > 1 ? 's' : ''}</div></div>`; }).join('')}
        </div>`).join('')}
        <div class="val-note">Text is filled from templates per hazard type, so wording stays consistent and reviewable; areas, times and the issuing number come from the twin. Devanagari forces UCS-2 encoding (70 characters per SMS segment), which the counter accounts for.</div>`);
      body.querySelector('#langSeg').addEventListener('click', (ev) => { const b = ev.target.closest('[data-l]'); if (b) { lang = b.dataset.l; render(true); } });
    }
    function highlight(xml) {
      return esc(xml)
        .replace(/(&lt;\/?)([\w:]+)/g, '$1<span class="x-tag">$2</span>')
        .replace(/(\w+)=(&quot;[^&]*&quot;)/g, '<span class="x-attr">$1</span>=<span class="x-val">$2</span>');
    }
    return { render };
  }

  T.ops = { createCrises, createRed, createComms };
})(typeof window !== 'undefined' ? window : globalThis);
