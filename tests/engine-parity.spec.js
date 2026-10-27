const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// The offline engine (static/engine/engine.js, Swiss Ephemeris WebAssembly)
// must give the same chart as the server's /api/v1/chart. Spread of birth
// data: fixture charts plus seeded random dates 1850–2099, latitudes ±65°,
// fractional and negative time zones, and UT day rollovers.

function cases() {
  const list = [];
  const fx = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(fx).filter(f => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8'));
    if (j.birth_data) list.push({ name: f, ...j.birth_data });
  }
  let seed = 108;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pad = n => String(n).padStart(2, '0');
  const tzs = [-8, -5, -3.5, 0, 1, 5.5, 5.75, 8, 9.5, 12, 14];
  for (let i = 0; i < 60; i++) {
    const y = 1850 + Math.floor(rnd() * 250), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    list.push({
      name: `random-${i}`,
      date: `${y}-${pad(m)}-${pad(d)}`,
      time: `${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 60))}:${pad(Math.floor(rnd() * 60))}`,
      latitude: Math.round((rnd() * 130 - 65) * 1e4) / 1e4,
      longitude: Math.round((rnd() * 360 - 180) * 1e4) / 1e4,
      timezone_offset: tzs[Math.floor(rnd() * tzs.length)],
    });
  }
  return list;
}

const flatDasha = d => d.flatMap(m => [m, ...m.antardasha.flatMap(a => [a, ...a.pratyantardasha])]);
// Dasha boundaries agree to within a few microseconds (float rounding of the
// Moon's longitude); anything under a millisecond counts as the same.
const ms = iso => Date.parse(iso + 'Z');
const sameP = (a, b) => b && a.lord === b.lord && Math.abs(ms(a.start) - ms(b.start)) < 1 && Math.abs(ms(a.end) - ms(b.end)) < 1;

test('offline engine matches the server chart', async ({ page, request }) => {
  test.setTimeout(120000);
  await page.goto('/health');
  await page.evaluate(async () => {
    const eng = await import('/static/engine/engine.js');
    await eng.initEngine();
    window.computeChart = eng.computeChart;
    window.computeTransit = eng.computeTransit;
  });
  const diffs = [];
  let maxDeg = 0;
  for (const c of cases()) {
    const { name, ...bd } = c;
    const srv = await (await request.post('/api/v1/chart', { data: bd })).json();
    const loc = await page.evaluate(bd => window.computeChart(bd), bd);
    const bad = [];
    if (Math.abs(srv.ayanamsa - loc.ayanamsa) > 2e-6) bad.push(`ayanamsa ${srv.ayanamsa} vs ${loc.ayanamsa}`);
    const pts = [['Lagna', srv.lagna, loc.lagna], ...srv.grahas.map((g, i) => [g.graha, g, loc.grahas[i]])];
    for (const [label, s, l] of pts) {
      const dd = Math.abs(((s.longitude - l.longitude + 540) % 360) - 180);
      maxDeg = Math.max(maxDeg, dd);
      if (dd > 0.00015) bad.push(`${label} lon ${s.longitude} vs ${l.longitude}`);
      for (const k of ['rashi', 'nakshatra', 'pada', 'house', 'retrograde'])
        if (k in s && s[k] !== l[k]) bad.push(`${label} ${k} ${s[k]} vs ${l[k]}`);
    }
    srv.bhavas.forEach((b, i) => { if (b.rashi !== loc.bhavas[i].rashi) bad.push(`house ${b.house} rashi`); });
    // Everything else on lagna, grahas and bhavas must be identical.
    for (const k of ['birth_data', 'lagna', 'grahas', 'bhavas'])
      if (JSON.stringify(srv[k]) !== JSON.stringify(loc[k])) bad.push(`${k} not identical`);
    const sd = flatDasha(srv.dasha), ld = flatDasha(loc.dasha);
    if (sd.length !== ld.length) bad.push(`dasha count ${sd.length} vs ${ld.length}`);
    const i = sd.findIndex((x, k) => !sameP(x, ld[k]));
    if (i >= 0) bad.push(`dasha #${i}: ${sd[i].lord} ${sd[i].start} vs ${ld[i]?.lord} ${ld[i]?.start}`);
    // Divisional charts: every sign exactly; degrees are unrounded floats.
    srv.divisional_charts.forEach((sc, k) => {
      const lc = loc.divisional_charts[k];
      if (!lc || lc.chart_type !== sc.chart_type) { bad.push(`divisional #${k} ${sc.chart_type} missing`); return; }
      const near = (a, b) => (a === null && b === null) || Math.abs(a - b) < 1e-5;
      [['Lagna', sc.lagna, lc.lagna], ...sc.grahas.map((g, j) => [g.graha, g, lc.grahas[j]])].forEach(([lb, a, b]) => {
        if (a.rashi !== b.rashi) bad.push(`${sc.chart_type} ${lb} rashi ${a.rashi} vs ${b.rashi}`);
        else if (!near(a.degree_in_rashi, b.degree_in_rashi)) bad.push(`${sc.chart_type} ${lb} deg ${a.degree_in_rashi} vs ${b.degree_in_rashi}`);
      });
    });
    if (srv.divisional_charts.length !== loc.divisional_charts.length) bad.push('divisional chart count');
    if (JSON.stringify(srv.panchanga) !== JSON.stringify(loc.panchanga))
      bad.push(`panchanga ${JSON.stringify(srv.panchanga)} vs ${JSON.stringify(loc.panchanga)}`);
    if (bad.length) diffs.push(`${name} ${bd.date} ${bd.time} tz ${bd.timezone_offset}: ${bad.join('; ')}`);
  }
  // Transit positions (/api/v1/chart/transit): the same comparison.
  for (const c of cases().slice(0, 20)) {
    const { name, ...bd } = c;
    const srv = await (await request.post('/api/v1/chart/transit', { data: bd })).json();
    const loc = await page.evaluate(bd => window.computeTransit(bd), bd);
    if (JSON.stringify(srv) !== JSON.stringify(loc)) {
      const k = Object.keys(srv).find(k => JSON.stringify(srv[k]) !== JSON.stringify(loc[k]));
      diffs.push(`transit ${name}: ${k} ${JSON.stringify(srv[k]).slice(0, 200)} vs ${JSON.stringify(loc[k]).slice(0, 200)}`);
    }
  }
  console.log(`engine parity: ${cases().length} charts, max longitude difference ${(maxDeg * 3600).toFixed(3)} arcsec`);
  expect(diffs).toEqual([]);
});
