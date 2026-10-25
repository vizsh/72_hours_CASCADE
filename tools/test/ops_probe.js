// Node probe for the operations layer: Cascade-R, crises, red team, comms, deadlines.
//   node tools/test/ops_probe.js [city] [scenario] [t]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../..');
global.window = global;
const city = process.argv[2] || 'nagpur', scen = process.argv[3] || 'monsoon2023';
const geoFile = city === 'raleigh' ? 'src/js/data/geodata.js' : `src/js/data/geodata_${city}.js`;
for (const f of [geoFile, 'src/js/core.js', 'src/js/engine/scenarios.js', 'src/js/engine/engine.js', 'src/js/engine/interventions.js',
  'src/js/engine/analytics.js', 'src/js/engine/comms.js', 'src/js/engine/redteam.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const geo = TWIN_GEOS[city];
TWIN.core.setTZ(geo.tz, geo.tzLabel);
let t = Date.now();
const E = TWIN.engine.create(geo, { scenario: scen });
const tNow = +(process.argv[4] || TWIN.scenarios[scen].liveNow || 34.5), k = E.kOf(tNow);
console.log(`${city}/${scen} engine ${Date.now() - t} ms, issue ${TWIN.core.fmtT(tNow)}`);
const an = TWIN.analytics.create(E);
for (const tt of [tNow - 12, tNow - 6, tNow, tNow + 6]) {
  const kk = E.kOf(Math.max(0, tt)), cr = an.cascadeR(kk);
  console.log(`  Cascade-R @${(kk * E.DT).toFixed(1)}: ${cr.r.toFixed(2)} (net ${cr.net.toFixed(2)} / haz ${cr.haz.toFixed(2)})`);
}
t = Date.now();
const X = an.crises(k);
console.log(`crises (${Date.now() - t} ms): ${X.list.length}, links ${X.links.length}`);
for (const c of X.list) console.log(`  ${c.id} ${c.type} [${c.stage}] maxR ${c.maxR.toFixed(2)} members ${c.members.map((i) => E.F[i].id).join(',')} districts ${c.districts.join('/')} next ${c.nextCrit ? E.F[c.nextCrit.i].id + '@' + c.nextCrit.t.toFixed(1) : '-'}`);
for (const l of X.links) console.log(`  link ${l.kind} ${X.list[l.from].id} -> ${X.list[l.to].id} ${l.kind === 'contends' ? E.F[l.fac].id : E.F[E.E[l.edge].from].id + '>' + E.F[E.E[l.edge].to].id}`);
if (X.list.length) {
  const c = X.list[0];
  for (const lang of TWIN.comms.cityCfg(geo).langs) { const m = TWIN.comms.sms(geo, E.t0, c, tNow, lang); console.log(`  SMS[${lang}] ${m.encoding} ${m.chars}c ${m.segments}seg: ${m.text}`); }
  const xml = TWIN.comms.cap(null, E, c, k, { cascadeR: an.cascadeR(k).r });
  console.log('  CAP bytes', xml.length, 'infos', (xml.match(/<info>/g) || []).length, 'sent', (xml.match(/<sent>([^<]*)/) || [])[1], 'polygon pts', (xml.match(/<polygon>([^<]*)/) || ['', ''])[1].split(' ').length);
}
// Planner: recommend, deadline, ghost trajectory
const pl = TWIN.interventions.create(E);
t = Date.now();
const ids = pl.recommend(k, 5);
const res = ids.length ? pl.evaluate(k, ids) : null;
console.log(`planner ${Date.now() - t} ms: ${ids.join(', ') || '(none)'}${res ? ` reduction ${(res.reduction * 100).toFixed(0)}%` : ''}`);
if (ids.length) {
  t = Date.now();
  const dl = pl.deadline(k, ids, 24, 2);
  console.log(`deadline ${Date.now() - t} ms: r0 ${(dl.r0 * 100).toFixed(0)}% actBy +${dl.actBy}h half +${dl.half}h  curve ${dl.pts.map((p) => `${p.h}:${Math.round(p.reduction * 100)}`).join(' ')}`);
  t = Date.now();
  const tr = pl.trajectory(k, ids, 24);
  let mn = 0; for (const d of tr.delta) mn = Math.min(mn, d);
  console.log(`trajectory ${Date.now() - t} ms: most negative delta ${mn.toFixed(2)}`);
}
const sit = TWIN.comms.sitrep(null, E, k, { number: 'No. 1', cr: an.cascadeR(k), crises: X, people: { high: 1000, crit: 500 }, plan: res ? { ids, result: res, deadline: null, catalog: pl.CATALOG } : null });
console.log('--- SITREP ---\n' + sit.split('\n').slice(0, 30).join('\n'));
// Red team
const atk = TWIN.redteam.attacks(E);
const pick = atk.map((a) => a.id);
const tA = Math.max(1, tNow - 6);
t = Date.now();
const att = TWIN.engine.create(geo, { scenario: scen, script: TWIN.redteam.merge(atk, pick, tA) });
const s = TWIN.redteam.score(E, att, atk, pick, tA, k);
console.log(`red team (${Date.now() - t} ms) from T+${tA}: flagged ${s.detected}/${s.sensors}, MAE ${s.maeClean.toFixed(3)} -> ${s.maeAtt.toFixed(3)}, maxShift ${s.maxShift.toFixed(2)}, spurious alerts ${s.extraAlerts.length} ${s.extraAlerts.map((a) => E.F[a.i].id + ':' + a.kind).join(',')}`);
for (const r of s.rows) console.log('  ', r.a.id, r.kind === 'sensor' ? `${E.F[r.i].id} flagged after ${r.flaggedAfter}h raw ${r.raw.toFixed(2)} twin ${r.twin.toFixed(2)} ctrl ${r.control.toFixed(2)} truth ${r.truth.toFixed(2)}` : r.kind === 'reports' ? `${r.n} posts held ${r.held} median ${r.median.toFixed(2)}` : `${r.dark}/${r.total} dark ESS ${r.essClean.toFixed(0)}->${r.essAtt.toFixed(0)}`);
