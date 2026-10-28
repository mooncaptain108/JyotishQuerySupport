const { test, expect } = require('@playwright/test');

// With the server unreachable (every /api/v1 request fails at the network
// level), index.html's apiFetch() falls back to static/engine/offline-api.js.
// The same steps run online and offline must give the same screens.

const ATLAS = { 'Delhi, India': { lat: '28.6139', lon: '77.2090', tz: 5.5, tzName: 'Asia/Kolkata' } };

// Proof the offline page really used the engine: apiFetch marked the
// server down and loaded offline-api.js (which loads the WebAssembly).
const usedEngine = page => page.evaluate(() => serverDownUntil > Date.now()
  && performance.getEntriesByType('resource').some(e => e.name.endsWith('swisseph.wasm')));

async function setup(page, { offline }) {
  await page.addInitScript(atlas => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('jyotish_hide_welcome', '1');
    localStorage.setItem('jyotish_atlas', JSON.stringify(atlas));
  }, ATLAS);
  await page.route('**/static/Open.md**', r => r.fulfill({ body: '# Jyotish Query' }));
  if (offline) await page.route('**/api/v1/**', r => r.abort('internetdisconnected'));
  await page.goto('/');
}

async function newChart(page) {
  await page.evaluate(() => window.openNewDialog());
  await page.selectOption('#nAtlas', 'Delhi, India');
  await page.fill('#nDate', '1990-05-15');
  await page.locator('#nDate').dispatchEvent('change');
  await page.fill('#nTime', '14:30:00');
  await page.fill('#nName', 'Offline test');
  await expect(page.locator('#nTz')).toHaveValue('5.5');
  await page.evaluate(() => window.newSubmit());
  await expect(page.locator('#rashiTable tr').nth(3)).toBeAttached();
  await expect(page.locator('#dashaList .dr').first()).toBeAttached();
  return page.evaluate(() => ({
    rashi: document.getElementById('rashiTable').innerText,
    dasha: document.getElementById('dashaList').innerText,
    chart: document.getElementById('chart').outerHTML.length,
  }));
}

test('New Chart works offline and shows the same chart as online', async ({ browser }) => {
  const on = await browser.newPage(), off = await browser.newPage();
  await setup(on, { offline: false });
  await setup(off, { offline: true });
  const a = await newChart(on), b = await newChart(off);
  expect(await usedEngine(off)).toBe(true);
  expect(await usedEngine(on)).toBe(false);
  expect(a.rashi).toContain('Sunrise');
  expect(b).toEqual(a);
  await off.screenshot({ path: 'test-results/offline-chart.png' });
  await on.close(); await off.close();
});

async function muhurta(page) {
  await page.evaluate(() => window.openMuhurtaDialog());
  await page.selectOption('#mAtlas', 'Delhi, India');
  await page.fill('#mDate', '2026-04-10');
  await page.locator('#mDate').dispatchEvent('change');
  await page.fill('#mDays', '5');
  await page.locator('#mDays').dispatchEvent('change');
  await page.click('#mStartBtn');
  await expect(page.locator('#mProgress')).toContainText('Done', { timeout: 120000 });
  return page.evaluate(() => getMuhurtaResults().map(r => ({ ...r, antarStart: r.antarStart && r.antarStart.slice(0, 23) })));
}

test('Muhurta search runs offline and finds the same moments as the server', async ({ browser }) => {
  test.setTimeout(240000);
  const on = await browser.newPage(), off = await browser.newPage();
  await setup(on, { offline: false });
  await setup(off, { offline: true });
  const sort = rs => rs.slice().sort((x, y) => (x.dt < y.dt ? -1 : 1));
  const a = sort(await muhurta(on)), b = sort(await muhurta(off));
  expect(await usedEngine(off)).toBe(true);
  expect(a.length).toBeGreaterThan(0);
  expect(b).toEqual(a);
  await on.close(); await off.close();
});

test('place search offline says it needs a connection', async ({ page }) => {
  await setup(page, { offline: true });
  await page.evaluate(() => {
    document.getElementById('aName').value = 'Pune';
    return window.atlasGeocode();
  });
  await expect(page.locator('#aGeoStatus')).toHaveText('Place search needs an internet connection.');
});
