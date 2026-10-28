const { test, expect } = require('@playwright/test');
const paulFixture = require('./fixtures/paul.json');

// #transitBar: the Now / time / date / scrub slider / unit / location controls
// that sit above the main chart whenever a transit is on screen (they used to
// live in the toolbar as #tbDate/#tbTime/#transitNowBtn -- server bf2f138).

const ATLAS = {
  'New Delhi, India': { lat: '28.6000', lon: '77.2000', tz: 5.5 },
  'Seattle, USA':     { lat: '47.6000', lon: '-122.3000', tz: -8 },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((atlas) => {
    localStorage.setItem('jyotish_hide_welcome', '1');
    localStorage.setItem('jyotish_atlas', JSON.stringify(atlas));
  }, ATLAS);
  await page.route('**/static/Open.md**', route =>
    route.fulfill({ body: '# Jyotish Query\n\nWelcome.' })
  );
});

async function loadChart(page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((data) => window.renderChart(data), paulFixture);
  await page.waitForSelector('#rashiTable tr', { state: 'attached' });
}

async function selectView(page, label) {
  await page.locator('#viewDropdown .tb-btn').first().click();
  await page.locator(`#viewMenu button:text-is("${label}")`).click();
}

// Switches to the Transits view and waits for the seeding fetch to land, then
// pins the transit moment to a fixed date/time so date arithmetic below is
// deterministic (seedTransitFromBirth() starts from "now").
async function openTransitsAt(page, date = '2026-01-31', time = '12:00:00') {
  const seeded = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit'));
  await selectView(page, 'Transits');
  await seeded;
  await page.evaluate(({ date, time }) => {
    document.getElementById('tDate').value = date;
    document.getElementById('tTime').value = time;
    window.syncTransitToolbarFields();
  }, { date, time });
}

// Sets the slider to n and fires the same events a drag would: input while
// moving, change on release.
async function scrub(page, n, { release = true } = {}) {
  await page.evaluate(({ n, release }) => {
    const s = document.getElementById('trSlider');
    s.value = String(n);
    s.dispatchEvent(new Event('input', { bubbles: true }));
    if (release) s.dispatchEvent(new Event('change', { bubbles: true }));
  }, { n, release });
}

test('old toolbar transit controls are gone', async ({ page }) => {
  await loadChart(page);
  for (const id of ['tbDate', 'tbTime', 'transitNowBtn', 'tbTransitLabel', 'tbTransitSep']) {
    await expect(page.locator('#' + id)).toHaveCount(0);
  }
});

test('View menu no longer has Transits Control', async ({ page }) => {
  await loadChart(page);
  await page.locator('#viewDropdown .tb-btn').first().click();
  await expect(page.locator('#viewMenu button')).toHaveText(['Chart', 'Transits', 'Chart & Transits', 'Ephemeris Report']);
});

// ◀ ▶ sit between the slider's right end and the unit list, and step the
// transit by one unit each press (same date math as the slider).
test('arrows sit between the slider and the unit list', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page);
  const box = id => page.locator('#' + id).boundingBox();
  const [sl, prev, next, unit] = await Promise.all(['trSlider', 'trPrevBtn', 'trNextBtn', 'trUnit'].map(box));
  expect(prev.x).toBeGreaterThanOrEqual(sl.x + sl.width);
  expect(next.x).toBeGreaterThan(prev.x + prev.width - 1);
  expect(unit.x).toBeGreaterThanOrEqual(next.x + next.width);
  // same line, finger-sized
  for (const b of [prev, next]) {
    expect(Math.abs((b.y + b.height / 2) - (unit.y + unit.height / 2))).toBeLessThan(4);
    expect(b.width).toBeGreaterThanOrEqual(36);
  }
});

test('arrows step the transit one unit and refetch', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page, '2026-01-31', '12:00:00');
  const fetched = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit'));
  await page.click('#trNextBtn');
  await fetched;
  await expect(page.locator('#trDate')).toHaveValue('2026-02-01');
  await page.click('#trPrevBtn');
  await page.click('#trPrevBtn');
  await expect(page.locator('#trDate')).toHaveValue('2026-01-30');
  await expect(page.locator('#tDate')).toHaveValue('2026-01-30');      // canonical field follows
  await page.selectOption('#trUnit', 'month');
  await page.click('#trNextBtn');
  await expect(page.locator('#trDate')).toHaveValue('2026-02-28');      // clamped like the slider
  await page.selectOption('#trUnit', 'hour');
  await page.click('#trPrevBtn');
  await expect(page.locator('#trDate')).toHaveValue('2026-02-28');
  await expect(page.locator('#trTime')).toHaveValue('11:00:00');
  await expect(page.locator('#transitBar svg, #chart')).not.toHaveCount(0);
});

test('stacked under Dasha Periods, the arrows share one line', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jyotish_transit_bar_pos', 'dasha'));
  await loadChart(page);
  await openTransitsAt(page);
  await expect(page.locator('#transitBar')).toHaveClass(/tr-stacked/);
  const prev = await page.locator('#trPrevBtn').boundingBox(), next = await page.locator('#trNextBtn').boundingBox();
  expect(Math.abs(prev.y - next.y)).toBeLessThan(2);
  expect(next.x).toBeGreaterThan(prev.x);
});

test('a failed transit fetch shows its error in the bar', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page);
  await page.route('**/api/v1/chart/transit', r => r.fulfill({ status: 500, body: '{}' }));
  await page.click('#trNextBtn');
  await expect(page.locator('#transitBar #transitErrMsg')).toHaveText('Error: Server error 500');
  await expect(page.locator('#transitErrMsg')).toBeVisible();
});

test('bar is hidden in Chart view and shown in transit views', async ({ page }) => {
  await loadChart(page);
  await expect(page.locator('#transitBar')).toBeHidden();

  await selectView(page, 'Transits');
  await expect(page.locator('#transitBar')).toBeVisible();

  await selectView(page, 'Chart & Transits');
  await expect(page.locator('#transitBar')).toBeVisible();

  await selectView(page, 'Chart');
  await expect(page.locator('#transitBar')).toBeHidden();
});

test('bar also shows when the Divisional panel is set to Transit', async ({ page }) => {
  await loadChart(page);
  // paul.json has no divisional_charts, so #d9Area (and its dropdown) stays
  // hidden; set the value directly and fire the same onchange the UI would.
  await page.evaluate(() => {
    const sel = document.getElementById('divChartSelect');
    sel.value = 'Transit';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#transitBar')).toBeVisible();
});

test('bar fields mirror Transits Control, and editing them pushes back + refetches', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page, '2026-03-10', '08:15:00');
  await expect(page.locator('#trDate')).toHaveValue('2026-03-10');
  await expect(page.locator('#trTime')).toHaveValue('08:15:00');

  const req = page.waitForRequest(r => r.url().includes('/api/v1/chart/transit') &&
    r.postDataJSON().date === '2026-04-01');
  await page.fill('#trDate', '2026-04-01');
  await page.locator('#trDate').dispatchEvent('change');
  await req;
  await expect(page.locator('#tDate')).toHaveValue('2026-04-01');

  const req2 = page.waitForRequest(r => r.url().includes('/api/v1/chart/transit') &&
    r.postDataJSON().time === '21:30:00');
  await page.fill('#trTime', '21:30:00');
  await page.locator('#trTime').dispatchEvent('change');
  await req2;
  await expect(page.locator('#tTime')).toHaveValue('21:30:00');
});

test('Now button jumps the transit to the current date', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page, '2001-01-01', '00:00:00');
  await page.locator('#trNowBtn').click();
  const today = await page.evaluate(() => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  await expect(page.locator('#tDate')).toHaveValue(today);
  await expect(page.locator('#trDate')).toHaveValue(today);
});

test('slider moves by the selected unit and springs back to centre on release', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page, '2026-01-31', '12:00:00');
  await expect(page.locator('#trUnit')).toHaveValue('day');

  // Mid-drag: moves relative to the base captured at drag start, and is
  // reversible within the same gesture (re-derived, not accumulated).
  await scrub(page, 3, { release: false });
  await expect(page.locator('#tDate')).toHaveValue('2026-02-03');
  await scrub(page, -2, { release: false });
  await expect(page.locator('#tDate')).toHaveValue('2026-01-29');
  await expect(page.locator('#trDate')).toHaveValue('2026-01-29');

  // Release: thumb re-centres, landed-on moment becomes the new base.
  const fetched = page.waitForRequest(r => r.url().includes('/api/v1/chart/transit') &&
    r.postDataJSON().date === '2026-01-29');
  await scrub(page, -2);
  await fetched;
  await expect(page.locator('#trSlider')).toHaveValue('0');

  await scrub(page, 1);
  await expect(page.locator('#tDate')).toHaveValue('2026-01-30');
});

test('slider month/year units clamp day-of-month like the steppers', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page, '2026-01-31', '12:00:00');

  await page.selectOption('#trUnit', 'month');
  await scrub(page, 1);
  await expect(page.locator('#tDate')).toHaveValue('2026-02-28');

  await page.evaluate(() => { document.getElementById('tDate').value = '2024-02-29'; });
  await page.selectOption('#trUnit', 'year');
  await scrub(page, 1);
  await expect(page.locator('#tDate')).toHaveValue('2025-02-28');
});

test('a slider drag coalesces fetches instead of one per step', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page);
  let count = 0;
  page.on('request', r => { if (r.url().includes('/api/v1/chart/transit')) count++; });
  for (let n = 1; n <= 8; n++) await scrub(page, n, { release: false });
  await scrub(page, 8);
  await page.waitForTimeout(500);
  expect(count).toBeLessThanOrEqual(2);
  expect(count).toBeGreaterThanOrEqual(1);
});

test('location list mirrors the atlas and picking one moves the transit there', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page);

  const opts = await page.locator('#trLoc option').allTextContents();
  const atlasOpts = await page.locator('#tAtlas option').allTextContents();
  expect(opts).toEqual(atlasOpts);
  expect(opts).toEqual(expect.arrayContaining(Object.keys(ATLAS)));

  const req = page.waitForRequest(r => r.url().includes('/api/v1/chart/transit') &&
    Math.abs(r.postDataJSON().latitude - 47.6) < 1e-6);
  await page.selectOption('#trLoc', 'Seattle, USA');
  // transitAtlasLoad() fills lat/lon and re-resolves the tz; the bar itself
  // doesn't fetch, so nudge the date to trigger one with the new location.
  await expect(page.locator('#tAtlas')).toHaveValue('Seattle, USA');
  await expect(page.locator('#tLat')).toHaveValue('47.6000');
  await expect(page.locator('#tLon')).toHaveValue('-122.3000');
  await scrub(page, 1);
  await req;
});

// Layout (user feedback, after the bar first went above the chart): the bar
// sits directly BELOW the main wheel, matches #chartArea's width without
// widening it, and the wheel stays exactly where it is in Chart view.
// Checked at two differently proportioned viewports, since one can hide drift.
for (const vp of [{ width: 1600, height: 900 }, { width: 1024, height: 1366 }]) {
  test(`bar sits below the chart, chart doesn't move, at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await loadChart(page);
    const rects = () => page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect().toJSON();
      return { chart: r('chart'), area: r('chartArea'), bar: r('transitBar'), rashi: r('rashiBox') };
    });
    const before = await rects();

    await selectView(page, 'Transits');
    await expect(page.locator('#transitBar')).toBeVisible();
    const after = await rects();

    // Wheel in the same place and size as Chart view.
    for (const k of ['top', 'left', 'width', 'height']) {
      expect(Math.abs(after.chart[k] - before.chart[k]), 'chart ' + k).toBeLessThanOrEqual(1);
    }
    // Bar below the wheel, same width as #chartArea, which itself didn't widen
    // (so the Rashi/divisional/dasha panels to its right didn't shift).
    expect(after.bar.top).toBeGreaterThanOrEqual(after.chart.bottom - 1);
    expect(Math.abs(after.bar.left - after.area.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.bar.width - after.area.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.area.width - before.area.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.rashi.left - before.rashi.left)).toBeLessThanOrEqual(1);
  });
}

test('slider unit list includes minute and hour', async ({ page }) => {
  await loadChart(page);
  expect(await page.locator('#trUnit option').evaluateAll(os => os.map(o => o.value)))
    .toEqual(['second', 'minute', 'hour', 'day', 'month', 'year']);
});

test('hour and minute steps roll over midnight into the next/previous day', async ({ page }) => {
  await loadChart(page);
  await openTransitsAt(page, '2026-12-31', '23:30:00');
  await page.selectOption('#trUnit', 'hour');
  await scrub(page, 2);
  await expect(page.locator('#tDate')).toHaveValue('2027-01-01');
  await expect(page.locator('#tTime')).toHaveValue('01:30:00');
  await scrub(page, -2);
  await expect(page.locator('#tDate')).toHaveValue('2026-12-31');
  await expect(page.locator('#tTime')).toHaveValue('23:30:00');
  // Slider range is -10..10 steps.
  await page.evaluate(() => { document.getElementById('tTime').value = '23:55:00'; });
  await page.selectOption('#trUnit', 'minute');
  await scrub(page, 10);
  await expect(page.locator('#tDate')).toHaveValue('2027-01-01');
  await expect(page.locator('#tTime')).toHaveValue('00:05:00');
});

test.describe('device in a DST time zone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('stepping is plain wall-clock math, unaffected by the device clock skipping 02:00', async ({ page }) => {
    await loadChart(page);
    await openTransitsAt(page, '2026-03-08', '01:30:00'); // LA springs forward 02:00 -> 03:00 this night
    await page.selectOption('#trUnit', 'hour');
    await scrub(page, 1);
    await expect(page.locator('#tTime')).toHaveValue('02:30:00');
    await expect(page.locator('#tDate')).toHaveValue('2026-03-08');
  });
});
