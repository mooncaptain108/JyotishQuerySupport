const { test, expect } = require('@playwright/test');

// static/engine/muhurta.js (port of services/muhurta_analysis.py) against
// POST /api/v1/muhurta/screen: the full analysis and the screening result
// must be identical, for every lagna and under several screening configs.

const CFGS = {
  ideal: null, // filled from GET /api/v1/muhurta/ideal-cfg
  // Every exception allowed and no minimums, so charts get past the early
  // rules and the dasha / strong planets / houses / benefic rules run.
  permissive: {
    minBeneficDays: 0, antarMin: 0, lagnaLordMin: 0, minStrongPlanets: 0, minStrongHouses: 0,
    planetMins: {}, lowerStrongThreshold: false, noFmLagna: false,
    allowAffRaKe: true, allowAffMmp: true, allowAffDust: true, allowAffChain: true, allowAffCond5: true,
    allowRule5b: true, allowRule5c: true,
  },
  // 60% threshold, weak antardasha allowed, a per-planet minimum.
  lowered: {
    minBeneficDays: 10, antarMin: 0, lagnaLordMin: 0.6, minStrongPlanets: 3, minStrongHouses: 5,
    planetMins: { Jupiter: 0.5 }, lowerStrongThreshold: true, noFmLagna: true,
    allowAffRaKe: true, allowAffMmp: true, allowAffDust: true, allowAffChain: true, allowAffCond5: true,
    allowRule5b: true, allowRule5c: true,
  },
};

function cases(n) {
  let seed = 2026;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pad = v => String(v).padStart(2, '0');
  const places = [[47.4833, -122.2166, -8], [41.0072, -91.963, -6], [28.6139, 77.209, 5.5],
    [51.5074, -0.1278, 0], [-33.8688, 151.2093, 10], [35.6762, 139.6503, 9], [-23.5505, -46.6333, -3]];
  return Array.from({ length: n }, (_, i) => {
    const [latitude, longitude, timezone_offset] = places[i % places.length];
    return {
      date: `${1950 + Math.floor(rnd() * 100)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`,
      time: `${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 60))}:00`,
      latitude, longitude, timezone_offset,
    };
  });
}

// Exact structural comparison: same keys, null vs missing distinguished,
// numbers equal. Returns the first difference as "path: a vs b".
function firstDiff(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') return a === b ? null : `${path}: ${a} vs ${b}`;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
    return a === b ? null : `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `${path}: keys ${ka.filter(k => !kb.includes(k))} | ${kb.filter(k => !ka.includes(k))}`;
  for (const k of ka) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  return null;
}

test('muhurta analysis and screening match the server', async ({ page, request }) => {
  test.setTimeout(300000);
  await page.goto('/health');
  await page.evaluate(async () => {
    window.mu = await import('/static/engine/muhurta.js');
    const eng = await import('/static/engine/engine.js');
    await eng.initEngine();
    window.computeChart = eng.computeChart;
  });
  CFGS.ideal = await (await request.get('/api/v1/muhurta/ideal-cfg')).json();
  expect(await page.evaluate(() => window.mu.IDEAL_CFG)).toEqual(CFGS.ideal);

  const diffs = [];
  const lagnas = new Set(), reasons = new Map();
  let passes = 0;
  for (const bd of cases(150)) {
    const chart = await (await request.post('/api/v1/chart', { data: bd })).json();
    lagnas.add(chart.lagna.rashi);
    for (const [cfgName, cfg] of Object.entries(CFGS)) {
      const srv = await (await request.post('/api/v1/muhurta/screen', { data: { chart, cfg } })).json();
      const loc = await page.evaluate(([chart, cfg]) => {
        const analysis = window.mu.analyzeAllGrahas(chart);
        return { analysis, screen: window.mu.screenMuhurta(chart, analysis, cfg) };
      }, [chart, cfg]);
      const d = firstDiff(srv, JSON.parse(JSON.stringify(loc)));
      if (d) diffs.push(`${bd.date} ${bd.time} ${cfgName}: ${d}`);
      const why = srv.screen.pass ? 'pass' : srv.screen.reason.replace(/[\d.]+/g, 'N').replace(/(on|of|lord|antardasha) \w+/g, '$1 X');
      reasons.set(why, (reasons.get(why) || 0) + 1);
      if (srv.screen.pass) passes++;
    }
    // End to end: the engine's own chart screens the same way.
    const own = await page.evaluate(([bd, cfg]) => {
      const c = window.computeChart(bd);
      return window.mu.screenMuhurta(c, window.mu.analyzeAllGrahas(c), cfg);
    }, [bd, CFGS.permissive]);
    const srvP = (await (await request.post('/api/v1/muhurta/screen', { data: { chart, cfg: CFGS.permissive } })).json()).screen;
    // (the engine's dasha boundaries can differ from the server's by a few µs)
    const ms = r => r.antarStart ? { ...r, antarStart: r.antarStart.slice(0, 23) } : r;
    const d = firstDiff(ms(srvP), ms(own));
    if (d) diffs.push(`${bd.date} ${bd.time} engine chart: ${d}`);
  }
  console.log(`muhurta parity: ${lagnas.size} lagnas, ${passes} passes; outcomes:\n  ` +
    [...reasons].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} ${r}`).join('\n  '));
  expect(lagnas.size).toBe(12);
  expect(diffs.slice(0, 20)).toEqual([]);
});
