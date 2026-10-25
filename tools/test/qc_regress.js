// Regression check: validation skill and sensor flags in clean runs, every city and scenario.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../..'); global.window = global;
for (const f of ['src/js/data/geodata.js', 'src/js/data/geodata_nagpur.js', 'src/js/core.js', 'src/js/engine/scenarios.js', 'src/js/engine/engine.js'])
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
TWIN_GEOS.raleigh = TWIN_GEOS.raleigh || TWIN_GEO;
for (const [city, geo] of Object.entries(TWIN_GEOS)) {
  for (const s of Object.values(TWIN.scenarios)) {
    if (s.cities && !s.cities.includes(city)) continue;
    const E = TWIN.engine.create(geo, { scenario: s.id });
    const V = E.validation();
    const flagged = E.alerts.filter((a) => a.kind === 'sensor').map((a) => `${E.F[a.i].id}@${a.t}`);
    const faulty = new Set(E.FAULTS.map((f) => f.id));
    const falseFlags = flagged.filter((x) => !faulty.has(x.split('@')[0]));
    console.log(`${city.padEnd(8)} ${s.id.padEnd(12)} lead ${V.medianLead.toFixed(1).padStart(4)}h pod ${V.pod.toFixed(2)} far ${V.far.toFixed(2)} brier ${V.brier.toFixed(3)} bss ${V.bss.toFixed(2)} | flagged ${flagged.join(' ')}${falseFlags.length ? '  FALSE: ' + falseFlags.join(' ') : ''}`);
  }
}
