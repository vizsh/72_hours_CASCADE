/* Web Worker hosting the cascade engine for the website pages (see rpc.js). */
self.window = self; // the engine and geodata scripts attach to window
importScripts(
  '../data/geodata_nagpur.js', '../data/geodata.js',
  '../core.js', '../engine/scenarios.js', '../engine/engine.js', '../engine/interventions.js',
  '../engine/analytics.js', '../engine/comms.js', '../engine/redteam.js', 'rpc.js',
);
self.onmessage = (ev) => {
  const { id, op, args } = ev.data;
  try {
    const result = self.TWIN_RPC.handle(op, args);
    self.postMessage({ id, result }, self.TWIN_RPC.transferOf(result));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
