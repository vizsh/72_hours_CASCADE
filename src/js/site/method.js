/* Method: live figures from the monsoon replay. */
(function () {
  const S = window.SITE, { $, esc } = S;
  S.chrome('method');
  const SCEN = 'monsoon2023';
  let snap = null, mem = null, fac = 0, k = 80, truth = false;
  const KEY = ['LAK-ABZ', 'DRN-NAR', 'TRF-JRS', 'PWR-VSN', 'TEL-TEX', 'EMS-PCR', 'HSP-GMC'];

  S.call('snapshot', { city: 'nagpur', scen: SCEN }).then((s) => {
    snap = s;
    const opts = s.F.filter((f) => KEY.includes(f.id)).concat(s.F.filter((f) => !KEY.includes(f.id) && f.sys !== 'weather'));
    $('#mFac').innerHTML = opts.map((f) => `<option value="${f.i}">${esc(f.name)}</option>`).join('');
    fac = opts[0].i;
    $('#mK').max = s.K - 4;
    loadMembers();
    learning(); trust(); cascadeR(); validation();
  }).catch((e) => { document.querySelectorAll('.method-fig').forEach((el) => { el.insertAdjacentHTML('afterbegin', `<p class="status-line err"><i class="led"></i>${esc(e.message)}</p>`); }); });

  $('#mFac').addEventListener('change', (e) => { fac = +e.target.value; loadMembers(); });
  $('#mK').addEventListener('input', (e) => { k = +e.target.value; drawEnsemble(); });
  $('#mTruth').addEventListener('change', (e) => { truth = e.target.checked; drawEnsemble(); });
  function loadMembers() { S.call('members', { city: 'nagpur', scen: SCEN, i: fac }).then((m) => { mem = m; drawEnsemble(); }); }

  function drawEnsemble() {
    if (!snap || !mem) return;
    const N = snap.N, K = snap.K, M = mem.M, DT = snap.DT, t = k * DT;
    $('#mKlabel').textContent = `T+${t.toFixed(1)}h · ${S.clock(snap.t0, t, snap.tz).day} ${S.clock(snap.t0, t, snap.tz).time}`;
    const c = S.chart($('#mEns'), { height: 400, xr: [0, 72], yr: [0, 1], yticks: [0, 0.35, 0.55, 0.75, 1], yfmt: (v) => (v === 0.35 ? 'watch' : v === 0.55 ? 'high' : v === 0.75 ? 'crit' : v.toFixed(0)), padL: 40, xticks: [0, 12, 24, 36, 48, 60, 72], xfmt: (v) => `T+${v}`,
      bands: [{ y0: 0.75, y1: 1, color: 'rgba(229,72,77,0.05)' }], series: [], marks: [{ x: t, label: 'issued', color: 'rgba(121,167,227,0.8)' }] });
    const g = c.g, w = mem.w.subarray(k * M, (k + 1) * M);
    const order = Array.from({ length: M }, (_, m) => m).sort((a, b) => w[a] - w[b]);
    for (const m of order) {
      const a = Math.min(0.9, Math.max(0.025, w[m] * M * 0.22));
      g.strokeStyle = `rgba(121,167,227,${a})`; g.lineWidth = w[m] * M > 2 ? 1.4 : 0.8;
      g.beginPath();
      for (let kk = 0; kk < K; kk++) { const x = c.X(kk * DT), y = c.Y(mem.traj[m * K + kk]); kk ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    // readings up to the issue time
    g.fillStyle = '#e4e8ee';
    for (let kk = 0; kk <= k; kk++) { const y = snap.obs[kk * N + fac]; if (Number.isNaN(y)) continue; g.beginPath(); g.arc(c.X(kk * DT), c.Y(y), 1.8, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#e2b93b'; g.lineWidth = 2; g.beginPath();
    for (let kk = 0; kk <= k; kk++) { const x = c.X(kk * DT), y = c.Y(snap.now[kk * N + fac]); kk ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    if (truth) { g.strokeStyle = '#fff'; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); for (let kk = 0; kk < K; kk++) { const x = c.X(kk * DT), y = c.Y(snap.truth[kk * N + fac]); kk ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.setLineDash([]); }
    // stats
    let pc = 0;
    for (let m = 0; m < M; m++) { for (let kk = k + 1; kk < Math.min(K, k + 48); kk++) if (mem.traj[m * K + kk] >= 0.75) { pc += w[m]; break; } }
    const top = Math.max(...w) * 100;
    $('#mStats').innerHTML = `<div><dt>Effective members</dt><dd class="mono">${Math.round(mem.ess[k])} / ${M}</dd></div><div><dt>Heaviest member</dt><dd class="mono">${top.toFixed(1)}%</dd></div><div><dt>P(critical in 24 h)</dt><dd class="mono">${S.pct(pc)}</dd></div><div><dt>Sensor trust</dt><dd class="mono">${S.pct(snap.trust[k * N + fac])}</dd></div>`;
  }
  new ResizeObserver(() => drawEnsemble()).observe($('#mEns'));

  function learning() {
    const s = snap, NE = s.NE, kL = s.K - 1;
    const real = s.E.filter((e) => !e.spurious && s.eStat[kL * NE + e.n] === 1).sort((a, b) => s.eMean[kL * NE + b.n] - s.eMean[kL * NE + a.n])[0];
    const fake = s.E.filter((e) => e.spurious).sort((a, b) => s.eLearn[kL * NE + b.n] - s.eLearn[kL * NE + a.n])[0];
    const idle = s.E.filter((e) => !e.spurious && s.eStat[kL * NE + e.n] === 0).sort((a, b) => s.eLearn[kL * NE + a.n] - s.eLearn[kL * NE + b.n])[0];
    const picks = [[real, '#79a7e3', 'real link'], [fake, '#e5484d', 'planted fake'], [idle, '#8a939e', 'never exercised']].filter((p) => p[0]);
    const draw = () => {
      const top = Math.max(0.3, ...picks.map(([e]) => Math.max(...Array.from({ length: s.K }, (_, kk) => s.eMean[kk * NE + e.n] + s.eSd[kk * NE + e.n])))) * 1.05;
      S.chart($('#mLearn'), { height: 340, xr: [0, 72], yr: [0, top], yticks: [0, +(top / 2).toFixed(2), +top.toFixed(2)], yfmt: (v) => v.toFixed(2), xticks: [0, 12, 24, 36, 48, 60, 72], xfmt: (v) => `T+${v}`,
        ribbons: picks.map(([e, col]) => ({ x0: 0, dx: s.DT, lo: Array.from({ length: s.K }, (_, kk) => Math.max(0, s.eMean[kk * NE + e.n] - s.eSd[kk * NE + e.n])), hi: Array.from({ length: s.K }, (_, kk) => s.eMean[kk * NE + e.n] + s.eSd[kk * NE + e.n]), color: col + '22' })),
        series: picks.map(([e, col]) => ({ y: Array.from({ length: s.K }, (_, kk) => s.eMean[kk * NE + e.n]), dx: s.DT, color: col, width: 1.8 })) });
    };
    draw();
    new ResizeObserver(draw).observe($('#mLearn'));
    const st = ['awaiting evidence', 'confirmed', 'pruned'];
    $('#mLearnLegend').innerHTML = picks.map(([e, col, kind]) => `<span><i style="border-color:${col}"></i><b>${esc(s.F[e.from].name)} → ${esc(s.F[e.to].name)}</b>&nbsp;· ${kind}, ends ${st[s.eStat[kL * NE + e.n]]} (±1 sd shaded)</span>`).join('');
  }

  function trust() {
    const s = snap, N = s.N;
    const faults = s.faults.filter((f) => s.F.some((x) => x.id === f.id));
    $('#mTrust').innerHTML = faults.map((f, n) => `<figure class="trust-card panel"><figcaption><b>${esc(s.F.find((x) => x.id === f.id).name)}</b><span>${esc(f.note)} · T+${f.from} to T+${f.to}</span></figcaption><canvas class="chart" id="mT${n}" style="height:170px"></canvas><p class="mono" id="mTs${n}"></p></figure>`).join('');
    faults.forEach((f, n) => {
      const i = s.F.find((x) => x.id === f.id).i;
      const draw = () => {
        const c = S.chart($('#mT' + n), { height: 170, xr: [0, 72], yr: [0, 1], yticks: [0, 0.5, 1], yfmt: (v) => v.toFixed(1), xticks: [0, 24, 48, 72], xfmt: (v) => `T+${v}`,
          bands: [], series: [
            { y: Array.from({ length: s.K }, (_, kk) => s.truth[kk * N + i]), dx: s.DT, color: 'rgba(255,255,255,0.55)', dash: [4, 3], width: 1.2 },
            { y: Array.from({ length: s.K }, (_, kk) => s.trust[kk * N + i]), dx: s.DT, color: '#79a7e3', width: 1.8, fill: '#79a7e3', fillAlpha: 0.08 }] });
        const g = c.g;
        g.fillStyle = 'rgba(226,185,59,0.1)'; g.fillRect(c.X(f.from), c.pad.t, c.X(Math.min(72, f.to)) - c.X(f.from), c.h - c.pad.t - c.pad.b);
        g.fillStyle = '#e4e8ee';
        for (let kk = 0; kk < s.K; kk++) { const y = s.obs[kk * N + i]; if (Number.isNaN(y)) continue; g.beginPath(); g.arc(c.X(kk * s.DT), c.Y(y), 1.4, 0, Math.PI * 2); g.fill(); }
      };
      draw();
      new ResizeObserver(draw).observe($('#mT' + n));
      let kf = -1;
      for (let kk = Math.round(f.from / s.DT); kk < s.K; kk++) if (s.trust[kk * N + i] < 0.5) { kf = kk; break; }
      $('#mTs' + n).innerHTML = kf >= 0 ? `Quarantined <b>${(kf * s.DT - f.from).toFixed(1)} h</b> after the fault began · trust ${S.pct(s.trust[kf * N + i])}` : 'Not quarantined: the faulty readings stayed close enough to the truth to be harmless.';
    });
    if (!faults.length) $('#mTrust').innerHTML = '<p class="dim">No planted faults in this scenario.</p>';
  }

  function cascadeR() {
    const s = snap;
    const draw = () => {
      const top = Math.max(1, ...Array.from(s.crNet, (v, q) => v + s.crHaz[q])) * 1.08;
      const c = S.chart($('#mCR'), { height: 340, xr: [0, 72], yr: [0, top], yticks: [0, +(top / 2).toFixed(0), +top.toFixed(0)], yfmt: (v) => v.toFixed(0), xticks: [0, 12, 24, 36, 48, 60, 72], xfmt: (v) => `T+${v}`, padR: 40, series: [] });
      const g = c.g, K = s.K;
      const area = (lo, hi, col) => { g.beginPath(); for (let q = 0; q < K; q++) g.lineTo(c.X(q * s.DT), c.Y(hi(q))); for (let q = K - 1; q >= 0; q--) g.lineTo(c.X(q * s.DT), c.Y(lo(q))); g.closePath(); g.fillStyle = col; g.fill(); };
      area(() => 0, (q) => s.crHaz[q], 'rgba(138,147,158,0.45)');
      area((q) => s.crHaz[q], (q) => s.crHaz[q] + s.crNet[q], 'rgba(239,107,115,0.5)');
      const rMax = Math.max(2, ...s.crR);
      const YR = (r) => c.pad.t + (1 - r / rMax) * (c.h - c.pad.t - c.pad.b);
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(c.pad.l, YR(1)); g.lineTo(c.w - c.pad.r, YR(1)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#e4e8ee'; g.lineWidth = 1.8; g.beginPath(); for (let q = 0; q < K; q++) { const x = c.X(q * s.DT), y = YR(s.crR[q]); q ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.fillStyle = '#a2abb6'; g.font = '500 10px ' + S.css('--font-mono'); g.textAlign = 'left';
      g.fillText('R = 1', c.w - c.pad.r + 4, YR(1) + 3); g.fillText(rMax.toFixed(1), c.w - c.pad.r + 4, YR(rMax) + 8);
    };
    draw();
    new ResizeObserver(draw).observe($('#mCR'));
  }

  function validation() {
    const s = snap, V = s.validation;
    const leads = V.leads.slice().sort((a, b) => (b.missed ? -1 : b.lead) - (a.missed ? -1 : a.lead));
    const draw = () => {
      const top = Math.max(24, ...leads.map((l) => l.lead)) * 1.08;
      const c = S.chart($('#mLead'), { height: 280, xr: [0, leads.length], yr: [0, top], yticks: [0, 12, 24, 36].filter((y) => y <= top), yfmt: (v) => v + ' h', xticks: [], series: [], padB: 10 });
      const g = c.g, bw = (c.X(1) - c.X(0)) * 0.7;
      leads.forEach((l, q) => {
        const x = c.X(q + 0.5) - bw / 2;
        if (l.missed) { g.fillStyle = '#e5484d'; g.fillRect(x, c.Y(0) - 3, bw, 3); return; }
        const y = c.Y(l.lead); g.fillStyle = '#79a7e3'; g.fillRect(x, y, bw, c.Y(0) - y);
      });
    };
    draw();
    new ResizeObserver(draw).observe($('#mLead'));
    $('#mVal').innerHTML = `<div><dt>Median lead</dt><dd class="mono">${V.lead.toFixed(1)} h</dd></div><div><dt>Critical events warned</dt><dd class="mono">${V.hits} of ${V.events}</dd></div><div><dt>False alarms</dt><dd class="mono">${V.falseAlarms} of ${V.alarms}</dd></div><div><dt>Brier score</dt><dd class="mono">${V.brier.toFixed(3)}</dd></div><div><dt>Skill vs climatology</dt><dd class="mono">${(V.bss >= 0 ? '+' : '') + V.bss.toFixed(2)}</dd></div><div><dt>Forecasts scored</dt><dd class="mono">${V.pairs.toLocaleString('en-IN')}</dd></div><div><dt>Reads from the future</dt><dd class="mono risk-normal">0</dd></div>`;
  }
})();
