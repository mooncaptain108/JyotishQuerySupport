const { test, expect } = require('@playwright/test');
const paulFixture = require('./fixtures/paul.json');

// Settings > Interface Tweaks popover: degree format, glyph show/bold/white
// groups, menu labels bold, panel labels white, chart lines white/bold.

test.beforeEach(async ({ page }) => {
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('jyotish_hide_welcome', '1');
    localStorage.setItem('jyotish_planet_glyphs', '1');
    localStorage.setItem('jyotish_sign_glyphs', '1');
  });
  await page.goto('/');
  await page.evaluate((d) => window.renderChart(d), paulFixture);
  await page.waitForSelector('#rashiTable tr', { state: 'attached' });
});

async function openTweaks(page) {
  await page.locator('#gearBtn').click();
  await page.locator('#settingsPanel button:has-text("Interface Tweaks")').click();
  await expect(page.locator('#dlgTweaks')).toBeVisible();
}

test('button in Settings opens the popover with grouped options', async ({ page }) => {
  await openTweaks(page);
  const groups = await page.locator('#dlgTweaks .tw-group').evaluateAll(gs =>
    gs.map(g => [g.querySelector('.tw-group-title').textContent, [...g.querySelectorAll('label')].map(l => l.textContent.replace(/\s+/g, ' ').trim())]));
  expect(groups).toEqual([
    ['Degrees', ['4:30 4.50', 'Degrees bold']],
    ['Planets', ['Su Mo', 'Bold', 'White']],
    ['Signs', ['Ar 1', 'Bold', 'White']],
    ['Menus & panels', ['Menu labels bold', 'Panel labels white', 'Panel labels bold', 'Dasha Periods dates white, planets bold', 'Dasha Periods slash white', 'Rashi Data text white (degrees, signs, Nakshatra, Sunrise)', 'Transit View text: remove all spaces']],
    ['Dialogs', ['Analysis bold', 'Analysis text plain']],
    ['Chart lines', ['Chart lines white', 'Chart lines bold']],
  ]);
  // moved out of the Settings panel itself
  for (const id of ['chkDegMin', 'chkDecimal', 'chkGlyphs', 'chkSignGlyphs'])
    await expect(page.locator('#settingsPanel #' + id)).toHaveCount(0);
});

test('degrees switch flips deg:min / decimal and repaints every visible chart', async ({ page }) => {
  await openTweaks(page);
  await expect(page.locator('#chkDegDecimal')).not.toBeChecked();
  const label = () => page.evaluate(() => [...document.querySelectorAll('#chart text.pl')].map(t => t.textContent).find(t => /\d/.test(t)));
  expect(await label()).toMatch(/\d+:\d\d/);
  await page.locator('#dlgTweaks .tw-mode').first().click();
  await expect(page.locator('#chkDegDecimal')).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('jyotish_deg_fmt'))).toBe('decimal');
  expect(await label()).toMatch(/\d+\.\d\d/);
  await page.locator('#dlgTweaks .tw-mode').first().click();
  expect(await page.evaluate(() => localStorage.getItem('jyotish_deg_fmt'))).toBe('degmin');
});

test('degrees switch keeps the Transits view on screen', async ({ page }) => {
  const transit = page.waitForResponse(r => r.url().includes('/api/v1/chart/transit'));
  await page.evaluate(() => setChartViewMode('transits'));
  await transit;
  await expect(page.locator('#chart')).toContainText('Transit');
  await openTweaks(page);
  await page.locator('#dlgTweaks .tw-mode').first().click();
  await expect(page.locator('#chart')).toContainText('Transit');
});

const TWEAKS = [
  ['#chkTwPgBold', 'jyotish_tw_pg_bold', 'tw-pg-bold'],
  ['#chkTwPgWhite', 'jyotish_tw_pg_white', 'tw-pg-white'],
  ['#chkTwSgBold', 'jyotish_tw_sg_bold', 'tw-sg-bold'],
  ['#chkTwSgWhite', 'jyotish_tw_sg_white', 'tw-sg-white'],
  ['#chkTwChartTextBold', 'jyotish_tw_chart_text_bold', 'tw-chart-text-bold'],
  ['#chkTwMenuBold', 'jyotish_tw_menu_bold', 'tw-menu-bold'],
  ['#chkTwAnalysisPlain', 'jyotish_tw_analysis_plain', 'tw-analysis-plain'],
  ['#chkTwPanelWhite', 'jyotish_tw_panel_white', 'tw-panel-white'],
  ['#chkTwPanelBold', 'jyotish_tw_panel_bold', 'tw-panel-bold'],
  ['#chkTwDashaDateWhite', 'jyotish_tw_dasha_date_white', 'tw-dasha-date-white'],
  ['#chkTwDashaSlashWhite', 'jyotish_tw_dasha_slash_white', 'tw-dasha-slash-white'],
  ['#chkTwRashiNakWhite', 'jyotish_tw_rashi_nak_white', 'tw-rashi-nak-white'],
  ['#chkTwAnalysisBold', 'jyotish_tw_analysis_bold', 'tw-analysis-bold'],
  ['#chkTwLinesWhite', 'jyotish_tw_lines_white', 'tw-lines-white'],
  ['#chkTwLinesBold', 'jyotish_tw_lines_bold', 'tw-lines-bold'],
];

test('each tweak applies live, persists, and is restored on reload', async ({ page }) => {
  await openTweaks(page);
  for (const [chk, key, cls] of TWEAKS) {
    await page.check(chk);
    expect(await page.evaluate(([k, c]) => [localStorage.getItem(k), document.body.classList.contains(c)], [key, cls])).toEqual(['1', true]);
  }
  await page.reload();
  for (const [, , cls] of TWEAKS) expect(await page.evaluate(c => document.body.classList.contains(c), cls)).toBe(true);
  await openTweaks(page);
  for (const [chk] of TWEAKS) await expect(page.locator(chk)).toBeChecked();
  for (const [chk, , cls] of TWEAKS) {
    await page.uncheck(chk);
    expect(await page.evaluate(c => document.body.classList.contains(c), cls)).toBe(false);
  }
});

test('White glyph tweaks recolour chart glyphs (planet and sign separately)', async ({ page }) => {
  const colors = () => page.evaluate(() => ({
    p: getComputedStyle(document.querySelector('#chart use.gp')).color,
    s: getComputedStyle(document.querySelector('#chart use.gs')).color,
  }));
  const before = await colors();
  expect(before.p).not.toBe('rgb(255, 255, 255)');
  await page.evaluate(() => document.body.classList.add('tw-pg-white'));
  expect(await colors()).toEqual({ p: 'rgb(255, 255, 255)', s: before.s });
  await page.evaluate(() => document.body.classList.add('tw-sg-white'));
  expect((await colors()).s).toBe('rgb(255, 255, 255)');
  await page.evaluate(() => document.body.classList.add('light'));
  expect(await colors()).toEqual({ p: 'rgb(26, 26, 46)', s: 'rgb(26, 26, 46)' }); // dark on the light theme
});

test('chart lines white/bold apply to the main and divisional charts', async ({ page }) => {
  const lines = () => page.evaluate(() => ['#chart polygon', '#d9Chart polygon'].map(sel => {
    const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el); return [cs.stroke, cs.strokeWidth];
  }).filter(Boolean));
  const set = (...cls) => page.evaluate((cls) => { document.body.classList.remove('tw-lines-white', 'tw-lines-bold'); document.body.classList.add(...cls); }, cls);
  // White looks heavier than gold at the same width, so it's drawn thinner;
  // Bold steps each up (gold 1 -> 1.5, white 0.65 -> 1).
  for (const [cls, stroke, w] of [
    [[], null, '1px'], [['tw-lines-white'], 'rgb(255, 255, 255)', '0.65px'],
    [['tw-lines-bold'], null, '1.5px'], [['tw-lines-white', 'tw-lines-bold'], 'rgb(255, 255, 255)', '1px'],
  ]) {
    await set(...cls);
    for (const [s, width] of await lines()) { if (stroke) expect(s).toBe(stroke); expect(width).toBe(w); }
  }
});

test('chart lines white/bold apply to the Rashi Data and Dasha Periods frames', async ({ page }) => {
  const frames = () => page.evaluate(() => ['#rashiInner', '#dashaInner'].map(sel => {
    const cs = getComputedStyle(document.querySelector(sel)); return [cs.borderTopColor, cs.borderTopWidth];
  }));
  const set = (...cls) => page.evaluate((cls) => { document.body.classList.remove('tw-lines-white', 'tw-lines-bold'); document.body.classList.add(...cls); }, cls);
  // Borders snap to whole pixels, so both colours are 1px and Bold is 2px.
  for (const [cls, color, w] of [
    [[], 'rgb(122, 90, 32)', '1px'], [['tw-lines-white'], 'rgb(255, 255, 255)', '1px'],
    [['tw-lines-bold'], 'rgb(122, 90, 32)', '2px'], [['tw-lines-white', 'tw-lines-bold'], 'rgb(255, 255, 255)', '2px'],
  ]) {
    await set(...cls);
    for (const [c, width] of await frames()) { expect(c).toBe(color); expect(width).toBe(w); }
  }
});

test('Dasha Periods dividers span the row text, not the full panel width', async ({ page }) => {
  const m = await page.evaluate(() => {
    const sep = document.querySelector('#dashaList .dr-sep').getBoundingClientRect();
    const row = document.querySelector('#dashaList .dr-sep + .dr');
    const first = row.firstElementChild.getBoundingClientRect();
    const date = row.querySelector('.dr-date');
    const textRight = date.getBoundingClientRect().right - parseFloat(getComputedStyle(date).paddingRight);
    const frame = document.getElementById('dashaInner').getBoundingClientRect();
    return { sepL: sep.left, sepR: sep.right, textL: first.left, textR: textRight, frameL: frame.left, frameR: frame.right };
  });
  expect(Math.abs(m.sepL - m.textL)).toBeLessThan(1.5);
  expect(Math.abs(m.sepR - m.textR)).toBeLessThan(1.5);
  expect(m.sepL - m.frameL).toBeGreaterThan(4);
  expect(m.frameR - m.sepR).toBeGreaterThan(4);
});

test('chart lines white/bold apply to the Dasha Periods maha dasha separators', async ({ page }) => {
  const sep = () => page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#dashaList .dr-sep')); return [cs.borderTopColor, cs.borderTopWidth]; });
  const set = (...cls) => page.evaluate((cls) => { document.body.classList.remove('tw-lines-white', 'tw-lines-bold'); document.body.classList.add(...cls); }, cls);
  for (const [cls, color, w] of [
    // same width as the frame once either option is on
    [[], 'rgb(90, 109, 148)', '2px'], [['tw-lines-white'], 'rgb(255, 255, 255)', '1px'],
    [['tw-lines-bold'], 'rgb(90, 109, 148)', '2px'], [['tw-lines-white', 'tw-lines-bold'], 'rgb(255, 255, 255)', '2px'],
  ]) {
    await set(...cls);
    expect(await sep()).toEqual([color, w]);
  }
});

test('panel labels bold bolds the birth details above the chart and the other panel labels', async ({ page }) => {
  const weights = () => page.evaluate(() =>
    ['#chart text.chart-ttl', '#divChartSelect', '#rashiTitle', '#dashaShadowTitle', '.dasha-hdr-btns button']
      .map(sel => getComputedStyle(document.querySelector(sel)).fontWeight));
  expect(await page.locator('#chart text.chart-ttl').count()).toBeGreaterThan(0);
  expect(await weights()).toEqual(['400', '400', '400', '400', '400']);
  await page.evaluate(() => document.body.classList.add('tw-panel-bold'));
  expect(await weights()).toEqual(['700', '700', '700', '700', '700']);
});

test('menu labels bold makes toolbar buttons bold white', async ({ page }) => {
  const st = () => page.evaluate(() => { const cs = getComputedStyle(document.getElementById('viewDropdown').querySelector('.tb-btn')); return [cs.fontWeight, cs.color]; });
  const before = await st();
  await page.evaluate(() => document.body.classList.add('tw-menu-bold'));
  expect(await st()).toEqual(['600', 'rgb(255, 255, 255)']);
  expect(before[0]).not.toBe('600');
});

test('panel labels white recolours the panel titles, including the SVG chart title', async ({ page }) => {
  await openTweaks(page);
  await page.check('#chkTwPanelWhite');
  const r = await page.evaluate(() => ({
    rashi: getComputedStyle(document.getElementById('rashiTitle')).color,
    svgTitle: [...document.querySelectorAll('#chart text')].find(t => /Paul/.test(t.textContent)).getAttribute('fill'),
  }));
  expect(r.rashi).toBe('rgb(255, 255, 255)');
  expect(r.svgTitle).toBe('#ffffff');
});

test('Mobile display is gone from the Settings panel', async ({ page }) => {
  await expect(page.locator('#chkChartBold')).toHaveCount(0);
  await expect(page.locator('#settingsPanel')).not.toContainText('Mobile display');
});

test('degrees bold makes the chart labels bold', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('jyotish_planet_glyphs', '0'); });
  const w = () => page.evaluate(() => getComputedStyle(document.querySelector('#chart text.pl')).fontWeight);
  await page.evaluate(() => document.body.classList.add('tw-chart-text-bold'));
  expect(await w()).toBe('700');
});

test('analysis text plain swaps the gold highlights in the Analysis popover', async ({ page }) => {
  await page.evaluate(() => openAnalysisDialog());
  const gold = () => page.evaluate(() => getComputedStyle(document.querySelector('#dlgAnalysis .c-gold')).color);
  expect(await gold()).toBe('rgb(201, 168, 76)');
  await page.evaluate(() => document.body.classList.add('tw-analysis-plain'));
  expect(await gold()).toBe('rgb(192, 192, 208)');
});

test('the text/glyph switch flips planets and signs, and lights up the active side', async ({ page }) => {
  await openTweaks(page);
  const active = (row) => page.evaluate((row) => {
    const g = [...document.querySelectorAll('#dlgTweaks .tw-mode')][row];
    const c = el => getComputedStyle(el).color;
    return c(g.querySelector('.tw-opt-glyph')) === 'rgb(201, 168, 76)' ? 'glyph' : (c(g.querySelector('.tw-opt-text')) === 'rgb(201, 168, 76)' ? 'text' : '?');
  }, row);
  await expect(page.locator('#chkGlyphs')).toBeChecked();
  expect(await active(1)).toBe('glyph');
  await page.locator('#dlgTweaks .tw-mode').nth(1).locator('.tw-opt-text').click(); // tap anywhere on the row
  await expect(page.locator('#chkGlyphs')).not.toBeChecked();
  expect(await active(1)).toBe('text');
  await expect(page.locator('#chart use.gp')).toHaveCount(0);
  await page.locator('#dlgTweaks .tw-mode').nth(2).click();
  await expect(page.locator('#chkSignGlyphs')).not.toBeChecked();
  await expect(page.locator('#chart use.gs')).toHaveCount(0);
  await expect(page.locator('#chart text.hn')).toHaveCount(12);
});

test('Planets Bold/White apply to text planet names, not their degrees', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('jyotish_planet_glyphs', '0'); });
  await page.reload();
  await page.evaluate((d) => window.renderChart(d), paulFixture);
  const st = () => page.evaluate(() => {
    const pn = document.querySelector('#chart .pn');
    const cs = getComputedStyle(pn), parent = getComputedStyle(pn.parentNode);
    return { name: [cs.fontWeight, cs.fill], text: parent.fontWeight };
  });
  const before = await st();
  expect(before.name[0]).toBe('400');
  await page.evaluate(() => document.body.classList.add('tw-pg-bold', 'tw-pg-white'));
  const after = await st();
  expect(after.name).toEqual(['700', 'rgb(255, 255, 255)']);
  expect(after.text).toBe('400'); // the degree after it is untouched
  // Degrees bold alone bolds the degree but leaves the name normal
  await page.evaluate(() => { document.body.classList.remove('tw-pg-bold'); document.body.classList.add('tw-chart-text-bold'); });
  const deg = await st();
  expect([deg.name[0], deg.text]).toEqual(['400', '700']);
});

test('Signs Bold/White apply to house sign numbers', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('jyotish_sign_glyphs', '0'); });
  await page.reload();
  await page.evaluate((d) => window.renderChart(d), paulFixture);
  const st = () => page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#chart text.hn')); return [cs.fill, cs.strokeWidth]; });
  expect((await st())[1]).toBe('0px');
  await page.evaluate(() => document.body.classList.add('tw-sg-bold', 'tw-sg-white'));
  expect(await st()).toEqual(['rgb(255, 255, 255)', '0.6px']);
});

test('panel labels white bolds/whitens the Dasha Now/Top buttons; dates have their own switch', async ({ page }) => {
  const st = () => page.evaluate(() => {
    const b = getComputedStyle(document.querySelector('.dasha-hdr-btns button'));
    const d = getComputedStyle(document.querySelector('#dashaList .dr-date'));
    return { btn: [b.fontSize, b.fontWeight, b.color], date: [d.fontSize, d.color] };
  });
  const before = await st();
  await page.evaluate(() => document.body.classList.add('tw-panel-white'));
  const panel = await st();
  expect(panel.btn).toEqual([before.btn[0], '700', 'rgb(255, 255, 255)']); // same size
  expect(panel.date).toEqual(before.date);                                  // dates untouched
  await page.evaluate(() => { document.body.classList.remove('tw-panel-white'); document.body.classList.add('tw-dasha-date-white'); });
  const dates = await st();
  expect(dates.date).toEqual([before.date[0], 'rgb(255, 255, 255)']);       // same size, white
  expect(dates.btn).toEqual(before.btn);                                    // buttons untouched
});

test('Dasha Periods slash white: the Maha/Antar slash matches the white dates', async ({ page }) => {
  const st = () => page.evaluate(() => {
    const sl = getComputedStyle(document.querySelector('#dashaList .dr-slash'));
    const d = getComputedStyle(document.querySelector('#dashaList .dr-date'));
    return { slash: [sl.fontFamily, sl.fontSize, sl.fontWeight, sl.color], date: [d.fontFamily, d.fontSize, d.fontWeight, d.color] };
  });
  const before = await st();
  expect(await page.evaluate(() => document.querySelector('#dashaList .dr-slash').textContent)).toBe('/');
  expect(before.slash[3]).toBe('rgb(96, 128, 160)');                        // #6080a0 default
  await page.evaluate(() => document.body.classList.add('tw-dasha-slash-white', 'tw-dasha-date-white'));
  const on = await st();
  expect(on.slash).toEqual(on.date);                                        // same font + white as the dates
  expect(on.slash[3]).toBe('rgb(255, 255, 255)');
});

test('anyone with Panel labels white keeps white dasha dates (one-time carry-over)', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('jyotish_tw_panel_white', '1'); localStorage.removeItem('jyotish_tw_dasha_date_white'); });
  await page.reload();
  expect(await page.evaluate(() => [localStorage.getItem('jyotish_tw_dasha_date_white'), document.body.classList.contains('tw-dasha-date-white')])).toEqual(['1', true]);
});

test('Dasha dates use the same colour as Rashi Data degree/sign, in both themes', async ({ page }) => {
  const cmp = () => page.evaluate(() => [
    getComputedStyle(document.querySelector('#dashaList .dr-date')).color,
    getComputedStyle(document.querySelectorAll('#rashiTable tr')[1].querySelectorAll('td')[1]).color,
  ]);
  const [dark1, dark2] = await cmp();
  expect(dark1).toBe(dark2);
  await page.evaluate(() => { applyDarkReader(true); });
  const [light1, light2] = await cmp();
  expect(light1).toBe(light2);
});

test('Analysis popover: smallest text raised to 0.88rem; Analysis bold bolds every line', async ({ page }) => {
  await page.evaluate(() => openAnalysisDialog());
  const st = () => page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const px = sel => parseFloat(getComputedStyle(document.querySelector('#analysisContent ' + sel)).fontSize) / rem;
    const weights = [...document.querySelectorAll('#analysisContent .an-item, #analysisContent .an-lagna > div')].map(e => getComputedStyle(e).fontWeight);
    return { sizes: [px('.an-item'), px('.an-lagna'), px('.an-run')], weights: [...new Set(weights)] };
  });
  const base = await st();
  expect(base.sizes).toEqual([0.88, 0.88, 0.88]);
  expect(base.weights).toContain('400');
  await page.evaluate(() => document.body.classList.add('tw-analysis-bold'));
  expect((await st()).weights).toEqual(['700']);
});

test('Rashi Data text white: degrees, signs, nakshatra and Sunrise go white together; same weight', async ({ page }) => {
  // Sunrise only shows when the chart carries panchanga; add it if the fixture lacks it.
  await page.evaluate(() => {
    if (!(lastData.panchanga && lastData.panchanga.sunrise)) {
      lastData.panchanga = Object.assign({}, lastData.panchanga, { sunrise: '05:21:00' });
      renderRashiData(lastData, lastAnalysis);
    }
  });
  const st = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('#rashiTable tr')].find(tr => tr.querySelector('td.rd-nak'));
    const tds = row.querySelectorAll('td');
    const cs = el => getComputedStyle(el);
    const sr = document.querySelector('#rashiTable td.rd-sunrise');
    return { planet: cs(tds[0]).color, deg: cs(tds[1]).color, sign: cs(tds[2]).color, nak: cs(tds[3]).color,
             sunrise: cs(sr).color, lord: cs(tds[4]).color, nakWeight: cs(tds[3]).fontWeight,
             cls: [...tds].slice(1, 4).map(td => td.className) };
  });
  const base = await st();
  expect(base.cls).toEqual(['rd-deg', 'rd-sign', 'rd-nak']);
  expect(base.nak).toBe(base.deg);
  expect(base.nak).toBe(base.sign);
  expect(base.sunrise).toBe(base.deg);
  await page.evaluate(() => document.body.classList.add('tw-rashi-nak-white'));
  const on = await st();
  for (const k of ['deg', 'sign', 'nak', 'sunrise']) expect(on[k], k).toBe('rgb(255, 255, 255)');
  expect(on.nakWeight).toBe(base.nakWeight); // not bolded (on hold)
  expect(on.planet).toBe(base.planet);       // planet and lord colours untouched
  expect(on.lord).toBe(base.lord);
});

