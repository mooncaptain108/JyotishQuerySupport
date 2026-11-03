const { test, expect } = require('@playwright/test');

// Settings > Transit Control Position: above the chart (inside the chart
// panel), below it (default), or stacked at the bottom of Dasha Periods.

const ATLAS = { Seattle: { lat: '47.6062', lon: '-122.3321', tz: -8, tzName: 'America/Los_Angeles' } };
const CHART = { id: 'c1', name: 'Test Person', date: '1982-11-02', time: '06:21:00', lat: '47.6062', lon: '-122.3321', tz: -8, locationName: 'Seattle' };

async function setup(page, pos) {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.addInitScript(({ atlas, chart, pos }) => {
    localStorage.setItem('jyotish_hide_welcome', '1');
    localStorage.setItem('jyotish_atlas', JSON.stringify(atlas));
    localStorage.setItem('jyotish_charts', JSON.stringify([chart]));
    if (pos) localStorage.setItem('jyotish_transit_bar_pos', pos);
  }, { atlas: ATLAS, chart: CHART, pos });
  await page.goto('/');
  const transit = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit'));
  await page.evaluate(() => loadChart('c1'));
  await transit;
  await expect(page.locator('#dashaPanel')).toBeVisible();
}

const rects = page => page.evaluate(() => {
  const r = id => document.getElementById(id).getBoundingClientRect().toJSON();
  return { chart: r('chart'), d9: r('d9Chart'), dasha: r('dashaPanel'), inner: r('dashaInner'), bar: r('transitBar'),
           parent: document.getElementById('transitBar').parentElement.id,
           rowW: document.getElementById('mainRow').scrollWidth };
});

async function showTransits(page) {
  await page.evaluate(() => setChartViewMode('transits'));
  await expect(page.locator('#transitBar')).toBeVisible();
}

test('defaults to Below Transit Chart; Settings shows the three options', async ({ page }) => {
  await setup(page);
  await page.locator('#gearBtn').click();
  await expect(page.locator('#selTransitBarPos')).toHaveValue('below');
  expect(await page.locator('#selTransitBarPos option').allTextContents())
    .toEqual(['Above Transit Chart', 'Below Transit Chart', 'Below Dasha Periods Chart']);
  await page.evaluate(() => closeSettings());
  await showTransits(page);
  const r = await rects(page);
  expect(r.parent).toBe('chartArea');
  expect(r.bar.top).toBeGreaterThanOrEqual(r.chart.bottom - 1);
});

test('Above: bar inside the chart panel above the wheel; only that panel moves down', async ({ page }) => {
  await setup(page, 'above');
  const before = await rects(page);
  await showTransits(page);
  const r = await rects(page);
  expect(r.parent).toBe('chartArea');
  expect(r.bar.bottom).toBeLessThanOrEqual(r.chart.top + 1);
  expect(r.chart.top).toBeGreaterThan(before.chart.top + 20);     // wheel slid down
  expect(Math.abs(r.d9.top - before.d9.top)).toBeLessThanOrEqual(1); // other panels didn't
  expect(Math.abs(r.dasha.top - before.dasha.top)).toBeLessThanOrEqual(1);
  expect(r.rowW).toBe(before.rowW);
});

test('Below Dasha: controls stacked under the dasha list, which fills the panel down to the neighbours', async ({ page }) => {
  await setup(page, 'dasha');
  const before = await rects(page);
  await showTransits(page);
  const r = await rects(page);
  expect(r.parent).toBe('dashaPanel');
  expect(r.rowW).toBe(before.rowW);                                          // same width
  expect(r.inner.height).toBeGreaterThanOrEqual(before.inner.height - 1);   // list not shrunk (grows if room)
  expect(Math.abs(r.inner.top - before.inner.top)).toBeLessThanOrEqual(1);
  expect(r.bar.top).toBeGreaterThanOrEqual(r.inner.bottom - 1);              // controls below it
  expect(r.bar.bottom).toBeLessThanOrEqual(r.dasha.bottom + 1);              // panel grew to fit
  expect(Math.abs(r.chart.top - before.chart.top)).toBeLessThanOrEqual(1);
  // Stacked: one control per line, each the bar's width.
  const tops = await page.evaluate(() => ['trNowBtn','trTime','trDate','trSlider','trUnit','trLoc']
    .map(id => document.getElementById(id).getBoundingClientRect().top));
  for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
});

test('changing the setting moves the bar immediately and is remembered', async ({ page }) => {
  await setup(page);
  await showTransits(page);
  await page.locator('#gearBtn').click();
  await page.selectOption('#selTransitBarPos', 'dasha');
  expect((await rects(page)).parent).toBe('dashaPanel');
  await page.selectOption('#selTransitBarPos', 'above');
  const r = await rects(page);
  expect(r.parent).toBe('chartArea');
  expect(r.bar.bottom).toBeLessThanOrEqual(r.chart.top + 1);
  expect(await page.evaluate(() => localStorage.getItem('jyotish_transit_bar_pos'))).toBe('above');
});

test('Below Dasha falls back to below the chart when the Dasha panel is hidden', async ({ page }) => {
  await setup(page, 'dasha');
  await page.evaluate(() => { document.getElementById('dashaPanel').style.display = 'none'; setChartViewMode('transits'); });
  await expect(page.locator('#transitBar')).toBeVisible();
  const r = await rects(page);
  expect(r.parent).toBe('chartArea');
  expect(r.bar.top).toBeGreaterThanOrEqual(r.chart.bottom - 1);
});

// Below Dasha sizing rules, by screen:
//  - the panel ends level with the neighbouring panels (end user 2026-11-03:
//    no gap under it); the dasha list takes whatever the controls leave, and
//    the controls end level with the Rashi Data frame -- but never below 4 rows
//  - too short even for that: 4 rows kept, panel extends just past the others
const bottoms = page => page.evaluate(() => {
  const r = id => document.getElementById(id).getBoundingClientRect();
  return {
    panel: r('dashaPanel').bottom, list: r('dashaList').height,
    row: document.querySelector('#dashaList .dr').getBoundingClientRect().height,
    floor: Math.max(r('chartArea').bottom, r('d9Area').bottom),
    bar: r('transitBar'), inner: r('dashaInner'), rashiInner: r('rashiInner').bottom,
  };
});

async function setupAt(page, vp) {
  await setup(page, 'dasha');
  await page.setViewportSize(vp);
  await page.waitForTimeout(400); // resize handler is debounced
}

for (const vp of [{ width: 915, height: 412 }, { width: 360, height: 800 }, { width: 412, height: 915 }]) {
  test(`Below Dasha on a ${vp.width}x${vp.height} phone: panel ends level with the other panels, controls level with the Rashi Data frame`, async ({ page }) => {
    await setupAt(page, vp);
    await showTransits(page);
    const m = await bottoms(page);
    expect(Math.abs(m.panel - m.floor)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.bar.bottom - m.rashiInner)).toBeLessThanOrEqual(1);
    expect(m.list / m.row).toBeGreaterThanOrEqual(4);
    expect(m.bar.top).toBeGreaterThanOrEqual(m.inner.bottom - 1);
  });
}

test('Below Dasha on a screen too short for controls + 4 rows: keeps 4 rows, extends only slightly', async ({ page }) => {
  await setupAt(page, { width: 320, height: 568 });
  await showTransits(page);
  const m = await bottoms(page);
  expect(m.list / m.row).toBeGreaterThanOrEqual(4);
  expect(m.list / m.row).toBeLessThan(5.5);          // no more than needed
  expect(m.panel).toBeGreaterThan(m.floor);           // had to extend
  expect(m.bar.top).toBeGreaterThanOrEqual(m.inner.bottom - 1);
});
