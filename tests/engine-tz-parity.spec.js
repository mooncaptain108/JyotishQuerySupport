const { test, expect } = require('@playwright/test');
const fx = require('./fixtures/user-export.json');

// static/engine/tz.js (offline) against the server's /api/v1/tz-offset
// (pytz) and /api/v1/tz-lookup (timezonefinder).

test.beforeEach(async ({ page }) => {
  await page.goto('/health');
  await page.evaluate(async () => { window.tz = await import('/static/engine/tz.js'); });
});

// Offsets must agree exactly for every zone the browser knows, from 1925 on.
// Before standard time (~1890) some zones' local mean time differs between
// the two databases; that's out of scope. The DST flag is display-only (the
// "Daylight Saving" label) and the browser can't see all-year war time or
// pytz's inverted Irish DST, so it only has to agree almost always.
test('tz offsets match the server for all zones', async ({ page, request }) => {
  test.setTimeout(300000);
  const zones = await page.evaluate(() => Intl.supportedValuesOf('timeZone'));
  const dates = ['1925-01-10', '1948-07-02', '1975-08-20', '2005-10-30', '2026-07-15'];
  const offDiffs = [], dstDiffs = [];
  for (const z of zones) for (const d of dates) {
    const r = await request.get(`/api/v1/tz-offset?iana_tz=${encodeURIComponent(z)}&date=${d}`);
    if (!r.ok()) continue;                       // zone newer than the server's pytz
    const s = await r.json();
    const l = await page.evaluate(([z, d]) => window.tz.tzOffsetForDate(z, d), [z, d]);
    if (Math.abs(s.offset - l.offset) > 1e-9) offDiffs.push(`${z} ${d}: ${s.offset} vs ${l.offset}`);
    else if (s.dst !== l.dst) dstDiffs.push(`${z} ${d}`);
  }
  expect(offDiffs).toEqual([]);
  expect(dstDiffs.length).toBeLessThan(zones.length * dates.length * 0.03);
});

// Zone names at points: every atlas place exactly; random land points
// mostly (the bundled map is coarse near borders) — counting a different
// name with the same offsets as a match.
test('tz lookup matches the server for atlas places and nearly all land', async ({ page, request }) => {
  const atlas = Object.entries(fx.jyotish_atlas).map(([name, a]) => ({ name, lat: +a.lat, lon: +a.lon }));
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const random = Array.from({ length: 3000 }, () => ({ name: 'random', lat: rnd() * 140 - 60, lon: rnd() * 360 - 180 }));
  const pts = [...atlas, ...random];
  const srv = (await (await request.post('/api/v1/tz-lookup', { data: { points: pts.map(({ lat, lon }) => ({ lat, lon })) } })).json()).zones;
  const loc = await page.evaluate(pts => pts.map(p => window.tz.tzNameAt(p.lat, p.lon)), pts);
  const same = await page.evaluate(([a, b]) => a.map((z, i) => {
    const key = z => z && ['2026-01-15', '2026-07-15'].map(d => window.tz.tzOffsetForDate(z, d).offset).join('/');
    const canon = z => z && new Intl.DateTimeFormat('en', { timeZone: z }).resolvedOptions().timeZone;
    return z === b[i] || canon(z) === canon(b[i]) || key(z) === key(b[i]);
  }), [srv, loc]);
  expect(atlas.filter((p, i) => !same[i]).map(p => `${p.name}: ${srv[atlas.indexOf(p)]}`)).toEqual([]);
  const land = random.map((p, i) => i + atlas.length).filter(i => srv[i] && !srv[i].startsWith('Etc/'));
  const misses = land.filter(i => !same[i]).length;
  console.log(`tz lookup: ${land.length} land points, ${misses} in a different zone`);
  expect(misses).toBeLessThan(land.length * 0.05);
});
