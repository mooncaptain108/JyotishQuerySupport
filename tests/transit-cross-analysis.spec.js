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
// Rahu/Ketu pair (always exactly opposite), and no MEP hits -- those would
// repeat Transit over Natal's (end user, 2026-10-30).
test('Transit over Transit section comes last: planet hits only, without self or Rahu/Ketu', async ({ page }) => {
  const content = await openCross(page, false);
  const heads = await content.locator('.an-section-head').allInnerTexts();
  expect(heads.map(h => h.toUpperCase())).toEqual(['TRANSIT OVER NATAL', 'NATAL OVER TRANSIT', 'TRANSIT OVER TRANSIT']);
  const want = await page.evaluate(() => {
    const planet = crossPlanetHits(transitAnalysis, transitAnalysis)
      .filter(h => h.source !== h.target && !(['Rahu','Ketu'].includes(h.source) && ['Rahu','Ketu'].includes(h.target))).length;
    return { planet };
  });
  // Lines after the last head: one header line per source planet plus one per hit (or "None within 5°").
  const lines = await content.evaluate(el => {
    const heads = el.querySelectorAll('.an-section-head');
    const out = []; let n = heads[heads.length - 1].nextElementSibling;
    while (n) { out.push(n.textContent.trim()); n = n.nextElementSibling; }
    return out;
  });
  const hitLines = lines.filter(l => / over /.test(l));
  expect(hitLines.length).toBe(want.planet);
  for (const l of hitLines) expect(l).not.toMatch(/MEP/);
  if (!want.planet) expect(lines).toEqual(['None within 5°']);
});

// Section titles: brighter and bolder than other analysis headings, in the
// untweaked analysis text colour, with or without Analysis text plain.
test('Chart & Transits section titles use the analysis text colour, bolder, tweak or not', async ({ page }) => {
  const content = await openCross(page, false);
  const style = () => content.locator('.an-section-head').first().evaluate(el => {
    const cs = getComputedStyle(el); return { color: cs.color, weight: cs.fontWeight };
  });
  const base = await style();
  expect(base).toEqual({ color: 'rgb(200, 160, 96)', weight: '800' });
  await page.evaluate(() => document.body.classList.add('tw-analysis-plain', 'tw-analysis-bold'));
  expect(await style()).toEqual(base);
});

// End-user report 2026-10-30: transit Jupiter at Cancer 29:52 and Ketu at Leo
// 2:47 (Rahu Aquarius 2:47) are 2.92° apart across a sign boundary and were
// missed by both Transit over Transit and the Transits tab. Orbs now carry
// across the cusp, labelled like the MEP hits.
test('cross-cusp planet hits show in Transit over Transit and the Transits tab', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jyotish_hide_welcome', '1'));
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.goto('/');
  await page.evaluate((d) => window.renderChart(d), paulFixture);
  await page.evaluate(() => setChartViewMode('both'));
  const pinned = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit') && r.request().postDataJSON().date === '2026-10-30');
  await page.evaluate(() => {
    document.getElementById('tDate').value = '2026-10-30';
    document.getElementById('tTime').value = '12:00:00';
    document.getElementById('tTz').value = '5';
    fetchAndRenderTransit();
  });
  await pinned;
  await expect.poll(() => page.evaluate(() => !!transitAnalysis && transitData.birth_data.date === '2026-10-30')).toBe(true);
  // Same moment the user reported: Jupiter late Cancer, Ketu early Leo.
  const pos = await page.evaluate(() => Object.fromEntries(transitData.grahas.map(g => [g.graha, [g.rashi, g.degree_in_rashi]])));
  expect(pos.Jupiter[0]).toBe(4); expect(pos.Jupiter[1]).toBeGreaterThan(29.8);
  expect(pos.Ketu[0]).toBe(5);    expect(pos.Ketu[1]).toBeLessThan(3);

  await page.evaluate(() => openAnalysisDialog());
  const tt = await page.locator('#analysisContent').evaluate(el => {
    const heads = el.querySelectorAll('.an-section-head'); const out = [];
    for (let n = heads[heads.length - 1].nextElementSibling; n; n = n.nextElementSibling) out.push(n.textContent.replace(/\s+/g, ' ').trim());
    return out;
  });
  // Ketu's own position over Jupiter ("Cusp"), Jupiter's 7th aspect over Rahu ("7th Aspect (Cusp)").
  const ke = tt.indexOf('Ke'), ju = tt.indexOf('Ju');
  expect(tt.slice(ke + 1).find(l => / over Ju /.test(l))).toMatch(/^Cusp 2\.9\d° over Ju/);
  expect(tt.slice(ju + 1).find(l => / over Ra /.test(l))).toMatch(/^7th Aspect \(Cusp\) 2\.9\d° over Ra/);

  // Transits tab: Jupiter afflicted by the Ra-Ke axis across the cusp.
  await page.locator('#analysisTabs button[data-tab="transits"]').click();
  const juAff = await page.evaluate(() => transitAnalysis.Jupiter.allFmAspects.map(a => [a.fm, a.orb.toFixed(2), a.via]));
  expect(juAff).toContainEqual(['Ra-Ke', '2.92', expect.stringContaining('(cusp)')]);
  await expect(page.locator('#analysisContent')).toContainText('(cusp)');
});
