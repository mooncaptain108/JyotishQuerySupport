const { test, expect, devices } = require('@playwright/test');

// Interface Tweaks > Transit Control date/time on one line (mobile), end-user
// request 2026-11-02: with the transit controls stacked under Dasha Periods on
// a phone, Time and Date share one row instead of two, giving the Dasha list
// more room. Touch devices only; hidden and inert with a mouse.

const ATLAS = { Karachi: { lat: '24.86', lon: '67.01', tz: 5, tzName: 'Asia/Karachi' } };
const CHART = { id: 'c1', name: 'Test Person', date: '1982-11-02', time: '06:21:00', lat: '24.86', lon: '67.01', tz: 5, locationName: 'Karachi' };

async function setup(page, compact) {
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.addInitScript(({ atlas, chart, compact }) => {
    localStorage.setItem('jyotish_hide_welcome', '1');
    localStorage.setItem('jyotish_atlas', JSON.stringify(atlas));
    localStorage.setItem('jyotish_charts', JSON.stringify([chart]));
    localStorage.setItem('jyotish_transit_bar_pos', 'dasha');
    localStorage.setItem('jyotish_tw_tr_dt_compact', compact ? '1' : '0');
  }, { atlas: ATLAS, chart: CHART, compact });
  await page.goto('/');
  const transit = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit'));
  await page.evaluate(() => loadChart('c1'));
  await transit;
  await page.evaluate(() => setChartViewMode('transits'));
  await expect(page.locator('#dashaPanel #transitBar')).toBeVisible();
}

const layout = page => page.evaluate(() => {
  const b = id => document.getElementById(id).getBoundingClientRect();
  const bar = b('transitBar'), t = b('trTime'), d = b('trDate'), list = b('dashaList');
  return { sameRow: Math.round(t.top) === Math.round(d.top), within: d.right <= bar.right + 0.5 && t.left >= bar.left - 0.5,
           barH: bar.height, listH: list.height };
});

test.describe('phone (touch)', () => {
  const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
  test.use({ ...pixel, viewport: { width: 915, height: 412 } });

  test('Time and Date share one row inside the bar, and the Dasha list gets taller', async ({ page }) => {
    await setup(page, false);
    const off = await layout(page);
    expect(off.sameRow).toBe(false);
    await page.evaluate(() => { document.getElementById('chkTwTrDtCompact').click(); });
    await expect.poll(async () => (await layout(page)).sameRow).toBe(true);
    const on = await layout(page);
    expect(on.within).toBe(true);
    expect(on.barH).toBeLessThan(off.barH);
    expect(on.listH).toBeGreaterThan(off.listH);
  });

  test('the option is shown in Interface Tweaks', async ({ page }) => {
    await setup(page, false);
    await page.evaluate(() => openTweaks());
    await expect(page.locator('#twTrDtCompactRow')).toBeVisible();
  });
});

test.describe('computer (mouse)', () => {
  test.use({ viewport: { width: 1180, height: 820 } });

  test('the option is hidden and has no effect', async ({ page }) => {
    await setup(page, true);
    await page.evaluate(() => openTweaks());
    await expect(page.locator('#twTrDtCompactRow')).toBeHidden();
    expect((await layout(page)).sameRow).toBe(false);
  });
});
