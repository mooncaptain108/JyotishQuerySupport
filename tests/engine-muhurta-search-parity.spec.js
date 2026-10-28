const { test, expect } = require('@playwright/test');

// static/engine/muhurta-search.js (Web Workers, in the browser) against the
// server's background search (POST /api/v1/muhurta/search): the final
// result lists must be identical.

const PERMISSIVE = {
  minBeneficDays: 0, antarMin: 0, lagnaLordMin: 0, minStrongPlanets: 0, minStrongHouses: 0,
  planetMins: {}, lowerStrongThreshold: false, noFmLagna: false,
  allowAffRaKe: true, allowAffMmp: true, allowAffDust: true, allowAffChain: true, allowAffCond5: true,
  allowRule5b: true, allowRule5c: true,
};
const DELHI = { lat: 28.6139, lon: 77.209, tz: 5.5, tzName: 'Asia/Kolkata', locName: 'Delhi' };

async function serverSearch(request, params) {
  const { job_id } = await (await request.post('/api/v1/muhurta/search', { data: params })).json();
  const t0 = Date.now();
  for (;;) {
    const st = await (await request.get(`/api/v1/muhurta/status/${job_id}`)).json();
    if (st.done) break;
    if (Date.now() - t0 > 240000) throw new Error('server search timed out');
    await new Promise(r => setTimeout(r, 500));
  }
  return { results: (await (await request.get(`/api/v1/muhurta/results/${job_id}`)).json()).results, secs: (Date.now() - t0) / 1000 };
}

// The engine's dasha boundaries can differ from the server's by a few µs.
const norm = rs => rs.map(r => ({ ...r, antarStart: r.antarStart && r.antarStart.slice(0, 23) }));

for (const [name, params] of [
  ['permissive, 4 signs, 10 days', { ...DELHI, date: '2026-11-01', time: '00:00', days: 10, targetSigns: [3, 6, 9, 12], cfg: PERMISSIVE }],
  ['saved settings, 2 signs, 20 days', { ...DELHI, date: '2026-04-10', time: '00:00', days: 20, targetSigns: [3, 7], cfg: null }],
]) {
  test(`muhurta search matches the server: ${name}`, async ({ page, request }) => {
    test.setTimeout(400000);
    if (!params.cfg) {
      const ideal = await (await request.get('/api/v1/muhurta/ideal-cfg')).json();
      params.cfg = { ...ideal, planetMins: { Jupiter: 0.6 } };
    }
    await page.goto('/health');
    const srv = await serverSearch(request, params);
    const loc = await page.evaluate(async params => {
      const { startSearch } = await import('/static/engine/muhurta-search.js');
      const t0 = performance.now();
      const s = startSearch(params);
      const st = await s.done;
      return { results: s.results(), status: st, secs: (performance.now() - t0) / 1000 };
    }, params);
    console.log(`${name}: server ${srv.results.length} results in ${srv.secs.toFixed(1)}s; ` +
      `browser ${loc.results.length} in ${loc.secs.toFixed(1)}s, ${loc.status.dayCurrent}/${loc.status.dayTotal} days, ${loc.status.fetchErrors} errors`);
    expect(loc.status.fetchErrors).toBe(0);
    expect(loc.status.dayCurrent).toBe(params.days);
    expect(srv.results.length).toBeGreaterThan(0);
    expect(norm(loc.results)).toEqual(norm(srv.results));
  });
}
