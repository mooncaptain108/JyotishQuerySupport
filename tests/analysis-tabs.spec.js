const { test, expect } = require('@playwright/test');
const paulFixture = require('./fixtures/paul.json');

// The Analysis popover has one tab per main-panel view (Chart / Transits /
// Chart & Transits) and opens on the tab for the current view. Switching tabs
// doesn't change the view. The Transits tabs use the current transit moment
// (seeded to "now" at chart load). End-user request, 2026-10-29.

async function loadChart(page) {
  await page.addInitScript(() => localStorage.setItem('jyotish_hide_welcome', '1'));
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.goto('/');
  await page.evaluate((d) => window.renderChart(d), paulFixture);
}

async function seedTransit(page) {
  await page.evaluate(() => seedTransitFromBirth());
  await expect.poll(() => page.evaluate(() => !!transitAnalysis)).toBe(true);
}

const activeTab = page => page.locator('#analysisTabs button.active');

test('Chart view opens on the Chart tab; other tabs work without changing the view', async ({ page }) => {
  await loadChart(page);
  await seedTransit(page);
  await page.evaluate(() => openAnalysisDialog());
  await expect(page.locator('#dlgAnalysis')).toBeVisible();
  await expect(page.locator('#analysisTabs')).toBeVisible();
  await expect(activeTab(page)).toHaveText('Chart');
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Chart Analysis');

  const transitDate = await page.evaluate(() => transitData.birth_data.date);
  await page.locator('#analysisTabs button[data-tab="transits"]').click();
  await expect(activeTab(page)).toHaveText('Transits');
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Transits Analysis');
  await expect(page.locator('#analysisContent .an-lagna').first()).toContainText(transitDate);
  await expect(page.locator('#muhurtaEvalBtn')).toHaveCount(0);

  await page.locator('#analysisTabs button[data-tab="both"]').click();
  await expect(activeTab(page)).toHaveText('Chart & Transits');
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Chart & Transits Analysis');
  await expect(page.locator('#analysisContent')).toContainText('Transits at ' + transitDate);
  await expect(page.locator('#analysisContent')).toContainText('Transit over Natal');

  await page.locator('#analysisTabs button[data-tab="chart"]').click();
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Chart Analysis');
  expect(await page.evaluate(() => chartViewMode)).toBe('chart');
});

test('Transits view opens on the Transits tab', async ({ page }) => {
  await loadChart(page);
  await seedTransit(page);
  await page.evaluate(() => setChartViewMode('transits'));
  await page.evaluate(() => openAnalysisDialog());
  await expect(activeTab(page)).toHaveText('Transits');
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Transits Analysis');
});

test('Chart & Transits view opens on the Chart & Transits tab', async ({ page }) => {
  await loadChart(page);
  await seedTransit(page);
  await page.evaluate(() => setChartViewMode('both'));
  await page.evaluate(() => openAnalysisDialog());
  await expect(activeTab(page)).toHaveText('Chart & Transits');
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Chart & Transits Analysis');
});

test('Transits tab says so when transit positions are not loaded yet', async ({ page }) => {
  await loadChart(page);
  await page.evaluate(() => { transitData = null; transitAnalysis = null; openAnalysisDialog(); });
  await page.locator('#analysisTabs button[data-tab="transits"]').click();
  await expect(page.locator('#analysisContent')).toContainText('Transit positions are not available yet');
});

test('Muhurta result charts get no tabs', async ({ page }) => {
  await loadChart(page);
  await page.evaluate(() => { currentMuhurtaIdx = 0; openAnalysisDialog(); });
  await expect(page.locator('#analysisTabs')).toBeHidden();
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Chart Analysis');
});

test('tab labels are larger and bold, unchanged by Interface Tweaks', async ({ page }) => {
  await loadChart(page);
  await page.evaluate(() => openAnalysisDialog());
  const style = () => page.locator('#analysisTabs button').evaluateAll(bs =>
    bs.map(b => { const cs = getComputedStyle(b); return [cs.fontWeight, cs.fontSize]; }));
  const base = await style();
  for (const [w] of base) expect(w).toBe('700');
  const rootPx = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  for (const [, sz] of base) expect(parseFloat(sz)).toBeCloseTo(0.95 * rootPx, 1);
  await page.evaluate(() => document.body.classList.add('tw-analysis-plain', 'tw-analysis-bold', 'tw-menu-bold', 'tw-panel-bold', 'tw-panel-white'));
  expect(await style()).toEqual(base);
});
