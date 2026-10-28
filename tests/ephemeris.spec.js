const { test, expect } = require('@playwright/test');
const paulFixture = require('./fixtures/paul.json');

// Suppress welcome dialog and Open.md fetch for all Ephemeris Report tests
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jyotish_hide_welcome', '1'));
  await page.route('**/static/Open.md**', route =>
    route.fulfill({ body: '# Jyotish Query\n\nWelcome.' })
  );
});

// Loads a chart, then pins the transit settings (Transits dialog fields) to a fixed
// date/time/location (New Delhi, 2026-09-05 12:00 IST) instead of "now" --
// so the Ephemeris Report's own preload has deterministic values to assert
// against, and so retrograde/direct state (which changes day to day) is
// pinned too. openEphemerisDialog() only reads these DOM fields, it doesn't
// require transitData/transitAnalysis to be populated.
async function loadChartWithFixedTransit(page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((data) => window.renderChart(data), paulFixture);
  await page.waitForSelector('#rashiTable tr', { state: 'attached' });
  await page.evaluate(() => {
    document.getElementById('tDate').value = '2026-09-05';
    document.getElementById('tTime').value = '12:00:00';
    document.getElementById('tLat').value = '28.6';
    document.getElementById('tLon').value = '77.2';
    document.getElementById('tTz').value = '5.5';
  });
}

async function openEphemerisDialog(page) {
  await page.locator('#viewDropdown .tb-btn').first().click();
  await page.locator('#viewMenu button:has-text("Ephemeris Report")').click();
  await expect(page.locator('#dlgEphemeris')).toBeVisible();
}

test('opens from the View menu with fields preloaded from the transit settings', async ({ page }) => {
  await loadChartWithFixedTransit(page);
  await openEphemerisDialog(page);

  await expect(page.locator('#eLocSelect')).toHaveValue('__current_transit__');
  await expect(page.locator('#eDate')).toHaveValue('2026-09-05');
  await expect(page.locator('#eTime')).toHaveValue('12:00:00');
  await expect(page.locator('#eInterval')).toHaveValue('Daily');
  await expect(page.locator('#eReport')).toBeHidden();
  await expect(page.locator('#eSaveReportBtn')).toBeHidden();
});

test('Go generates 60 rows with correct header, formatting, and R/D exceptions', async ({ page }) => {
  await loadChartWithFixedTransit(page);
  await openEphemerisDialog(page);

  await page.locator('#dlgEphemeris button:has-text("Go")').click();
  await expect(page.locator('#eSaveReportBtn')).toBeVisible({ timeout: 20000 });

  const text = await page.locator('#eReport').inputValue();
  const lines = text.split('\n');

  expect(lines.length).toBe(61); // header + 60 daily rows
  expect(lines[0].trim().split(/\s+/)).toEqual(
    ['Date', 'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu']
  );
  // First row = the seeded date/time/location itself; values (and the
  // Saturn 'R' / Rahu 'D' exception suffixes) cross-checked directly
  // against a live /api/v1/chart/transit call for the same moment.
  expect(lines[1].trim().split(/\s+/)).toEqual(
    ['05-Sep-26', '18°Le29\'', '1°Ge00\'', '21°Ge51\'', '26°Le19\'', '20°Ca21\'', '2°Li13\'', '19°Pi11\'R', '5°Aq31\'D']
  );
  expect(lines.some(l => l.includes('ERROR'))).toBe(false);
});

test('Monthly interval clamps day-of-month instead of rolling over', async ({ page }) => {
  await loadChartWithFixedTransit(page);
  await openEphemerisDialog(page);
  await page.selectOption('#eInterval', 'Monthly');
  await page.fill('#eDate', '2026-01-31');

  await page.locator('#dlgEphemeris button:has-text("Go")').click();
  await expect(page.locator('#eSaveReportBtn')).toBeVisible({ timeout: 20000 });

  const lines = (await page.locator('#eReport').inputValue()).split('\n');
  expect(lines[1].startsWith('31-Jan-26')).toBe(true);
  expect(lines[2].startsWith('28-Feb-26')).toBe(true); // clamped, not Feb 31
  expect(lines[3].startsWith('28-Mar-26')).toBe(true); // stays clamped, not back to 31
});

test('Save Report button is hidden again after reopening the dialog', async ({ page }) => {
  await loadChartWithFixedTransit(page);
  await openEphemerisDialog(page);
  await page.locator('#dlgEphemeris button:has-text("Go")').click();
  await expect(page.locator('#eSaveReportBtn')).toBeVisible({ timeout: 20000 });
  await page.locator('#dlgEphemeris').getByRole('button', { name: '✕' }).click();

  await openEphemerisDialog(page);
  await expect(page.locator('#eReport')).toBeHidden();
  await expect(page.locator('#eSaveReportBtn')).toBeHidden();
});

test('dialog can be dragged by its header (makeDraggable wiring)', async ({ page }) => {
  await loadChartWithFixedTransit(page);
  await openEphemerisDialog(page);

  const before = await page.locator('#dlgEphemeris').boundingBox();
  const header = page.locator('#dlgEphemeris .dlg-header');
  const hb = await header.boundingBox();

  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 150, hb.y + hb.height / 2 + 100, { steps: 10 });
  await page.mouse.up();

  const after = await page.locator('#dlgEphemeris').boundingBox();
  expect(after.x).toBeCloseTo(before.x + 150, 0);
  expect(after.y).toBeCloseTo(before.y + 100, 0);
});
