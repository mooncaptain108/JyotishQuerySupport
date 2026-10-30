const { test, expect } = require('@playwright/test');
const paulFixture = require('./fixtures/paul.json');

// Chart & Transits Analysis lists conjunctions/aspects between transit and
// natal planets. Planets must show like the Chart Analysis does -- glyphs when
// Interface Tweaks > Planets is on glyphs, Su/Mo abbreviations otherwise --
// not full English names (end-user report, 2026-10-17).

const NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

async function openCross(page, glyphs) {
  await page.addInitScript((g) => {
    localStorage.setItem('jyotish_hide_welcome', '1');
    localStorage.setItem('jyotish_planet_glyphs', g ? '1' : '0');
  }, glyphs);
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.goto('/');
  await page.evaluate((d) => window.renderChart(d), paulFixture);
  await page.evaluate(() => setChartViewMode('both'));
  // Pin the transit moment so the hit list is the same every run.
  const pinned = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit') && r.request().postDataJSON().date === '2026-10-17');
  await page.evaluate(() => {
    document.getElementById('tDate').value = '2026-10-17';
    document.getElementById('tTime').value = '12:00:00';
    fetchAndRenderTransit();
  });
  await pinned;
  await expect.poll(() => page.evaluate(() => !!transitAnalysis && transitData.birth_data.date === '2026-10-17')).toBe(true);
  await page.evaluate(() => openAnalysisDialog());
  await expect(page.locator('#analysisDlgTitle')).toHaveText('Chart & Transits Analysis');
  return page.locator('#analysisContent');
}

test('shows planet glyphs, not English names, when glyphs are on', async ({ page }) => {
  const content = await openCross(page, true);
  await expect(content.locator('svg.gph').first()).toBeVisible();
  const text = await content.innerText();
  for (const n of NAMES) expect(text, n).not.toMatch(new RegExp('\\b' + n + '\\b'));
});

test('shows Su/Mo abbreviations, not English names, when glyphs are off', async ({ page }) => {
  const content = await openCross(page, false);
  await expect(content.locator('svg.gph')).toHaveCount(0);
  const text = await content.innerText();
  expect(text).toMatch(/\b(Su|Mo|Ma|Me|Ju|Ve|Sa|Ra|Ke)\b/);
  for (const n of NAMES) expect(text, n).not.toMatch(new RegExp('\\b' + n + '\\b'));
});

// Third section (end-user request, 2026-10-30): the transit planets among
// themselves, same notation, at the bottom. No planet over itself, and no
// Rahu/Ketu pair (always exactly opposite).
test('Transit over Transit section comes last, without self or Rahu/Ketu hits', async ({ page }) => {
  const content = await openCross(page, false);
  const heads = await content.locator('.an-section-head').allInnerTexts();
  expect(heads.map(h => h.toUpperCase())).toEqual(['TRANSIT OVER NATAL', 'NATAL OVER TRANSIT', 'TRANSIT OVER TRANSIT']);
  const hits = await page.evaluate(() => crossPlanetHits(transitAnalysis, transitAnalysis)
    .filter(h => h.source !== h.target && !(['Rahu','Ketu'].includes(h.source) && ['Rahu','Ketu'].includes(h.target))).length);
  // Lines after the last head: one header line per source planet plus one per hit (or "None within 5°").
  const lines = await content.evaluate(el => {
    const heads = el.querySelectorAll('.an-section-head');
    const out = []; let n = heads[heads.length - 1].nextElementSibling;
    while (n) { out.push(n.textContent.trim()); n = n.nextElementSibling; }
    return out;
  });
  const hitLines = lines.filter(l => / over /.test(l));
  expect(hitLines.length).toBe(hits);
  if (!hits) expect(lines).toEqual(['None within 5°']);
  for (const l of hitLines) expect(l).not.toMatch(/MEP/);
});
