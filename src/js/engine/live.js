/* Live weather: builds a scenario from the Open-Meteo GFS ensemble for the city.

   The 31 GFS members (control + 30 perturbed) become the hazard prior: each particle
   draws one member, plus a small timing shift and intensity scale for sub-grid
   uncertainty. The past 24 h come from the same request (past_days=1), so the twin
   opens with a day of history and 48 h of forecast. Until real city feeds are wired in,
   sensor streams are synthesized from the control run; the UI says so. */
(function (root) {
  const { clamp, gauss } = root.TWIN.core;
  const API = 'https://ensemble-api.open-meteo.com/v1/ensemble';

  async function fetchEnsemble(geo, signal) {
    const [lng, lat] = geo.center;
    const q = new URLSearchParams({
      latitude: lat.toFixed(3), longitude: lng.toFixed(3),
      hourly: 'precipitation,temperature_2m,wind_speed_10m,wind_direction_10m',
      models: 'gfs025', past_days: '1', forecast_days: '3', timezone: geo.tz,
    });
    const res = await fetch(`${API}?${q}`, { signal });
    if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
    return res.json();
  }

  // Columns for one variable: control first, then member01…memberNN.
  function columns(hourly, name) {
    const keys = Object.keys(hourly).filter((k) => k === name || k.startsWith(name + '_member')).sort();
    return keys.map((k) => hourly[k].map((v) => (v == null ? 0 : v)));
  }

  function build(geo, data) {
    const H = data.hourly;
    if (!H || !H.time) throw new Error('Unexpected response from Open-Meteo');
    const P = columns(H, 'precipitation'), Tm = columns(H, 'temperature_2m'), Wd = columns(H, 'wind_speed_10m');
    const Dir = columns(H, 'wind_direction_10m');
    const nM = Math.min(P.length, Tm.length, Wd.length);
    if (!nM) throw new Error('No ensemble members in the response');
    // Index of the current hour in the city's local time series.
    const off = data.utc_offset_seconds || 0;
    const localNow = new Date(Date.now() + off * 1000).toISOString().slice(0, 13) + ':00';
    let iNow = H.time.indexOf(localNow);
    if (iNow < 0) iNow = Math.min(H.time.length - 1, 24);
    const i0 = Math.max(0, iNow - 24);
    const sign = off >= 0 ? '+' : '-', a = Math.abs(off) / 60, pad = (n) => String(n).padStart(2, '0');
    const t0 = `${H.time[i0]}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
    const minutes = new Date(Date.now() + off * 1000).getUTCMinutes();
    const liveNow = Math.round(((iNow - i0) + minutes / 60) * 2) / 2;
    const at = (arr, h) => {
      if (h <= 0) return arr[0];
      const j = Math.floor(h);
      if (j >= arr.length - 1) return arr[arr.length - 1];
      return arr[j] + (arr[j + 1] - arr[j]) * (h - j);
    };
    // Storm motion from the mean wind direction over the forecast window (direction is
    // where the wind comes from; motion is toward the opposite bearing).
    let sx = 0, sy = 0;
    for (let h = iNow; h < Math.min(iNow + 48, H.time.length); h++) {
      const d = ((Dir[0] || [])[h] || 0) * Math.PI / 180, w = (Wd[0] || [])[h] || 0;
      sx += w * Math.sin(d); sy += w * Math.cos(d);
    }
    const heading = ((Math.atan2(-sx, -sy) * 180) / Math.PI + 360) % 360;
    // Summary for the toast.
    let peak = 0, peakH = 0, tMax = -99, wMax = 0, wet = 0;
    for (let h = iNow; h < Math.min(i0 + 72, H.time.length); h++) {
      let s = 0;
      for (let m = 0; m < nM; m++) s += P[m][h];
      s /= nM;
      if (s > peak) { peak = s; peakH = h - iNow; }
      tMax = Math.max(tMax, Tm[0][h]); wMax = Math.max(wMax, Wd[0][h]);
      let n = 0;
      for (let m = 0; m < nM; m++) if (P[m][h] >= 5) n++;
      wet = Math.max(wet, n / nM);
    }
    const lognorm = (r, s) => Math.exp(gauss(r) * s);
    return {
      id: 'live',
      label: 'Live weather · GFS ensemble',
      blurb: `Rain, heat and wind from the ${nM}-member GFS ensemble for ${geo.city}, fetched ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Ensemble-mean peak ${peak.toFixed(1)} mm/h${peak > 0.2 ? ` in ${peakH} h` : ''}; max ${tMax.toFixed(0)}°C; ${Math.round(wet * 100)}% of members show ≥5 mm/h. City sensor streams are synthesized from the control run until real feeds are connected.`,
      cities: [geo.id],
      t0, liveNow, heading, live: true,
      hazardLabel: { drainage: 'Rainfall (GFS)', traffic: 'Rain slowdown (GFS)', power: 'Heat and wind (GFS)', telecom: 'Wind and heat (GFS)', hospital: 'Heat illness (GFS)', ems: 'Storm calls (GFS)' },
      summary: { members: nM, peak, peakH, tMax, wMax, wet },
      sample(r, truth) {
        if (truth) return { m: 0, sc: 1, sh: 0, v: 28, gx: 0, gy: 0 };
        return { m: Math.floor(r() * nM), sc: lognorm(r, 0.3), sh: gauss(r) * 1.2, v: 18 + r() * 22, gx: gauss(r) * 0.25, gy: gauss(r) * 0.25 };
      },
      rain(p, s, c, t) {
        const spatial = clamp(1 + p.gx * c / 8 + p.gy * s / 8, 0.4, 1.8);
        return Math.max(0, at(P[p.m], i0 + t - s / p.v + p.sh)) * p.sc * spatial;
      },
      heat(p, t) { return clamp((at(Tm[p.m], i0 + t + p.sh) - 33) / 12, 0, 1); },
      wind(p, s, c, t) { return clamp((at(Wd[p.m], i0 + t - s / p.v + p.sh) * Math.sqrt(p.sc) - 28) / 55, 0, 1); },
    };
  }

  root.TWIN.live = { fetchEnsemble, build };
})(typeof window !== 'undefined' ? window : globalThis);
