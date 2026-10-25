const { test, expect } = require('@playwright/test');
const paulFixture = require('./fixtures/paul.json');

// Phone/tablet portrait layout (server bf2f138):
// - #mainRow is overflow:auto, so the divisional/dasha panels that don't fit a
//   portrait viewport can be scrolled/swiped to instead of being clipped.
// - The toolbar wraps instead of clipping its right-hand buttons.

const PORTRAIT = [
  { name: 'iPad portrait',  width: 820, height: 1180 },
  { name: 'phone portrait', width: 390, height: 844 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jyotish_hide_welcome', '1'));
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

for (const vp of PORTRAIT) {
  test(`${vp.name}: #mainRow scrolls to reach the right-hand panels`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loadChart(page);

    const overflow = await page.evaluate(() => getComputedStyle(document.getElementById('mainRow')).overflowX);
    expect(overflow).toBe('auto');

    // Rightmost visible panel in #mainRow -- dasha if shown, else divisional.
    const target = await page.evaluate(() => {
      const ids = ['dashaPanel', 'd9Area'];
      return ids.find(id => {
        const el = document.getElementById(id);
        return el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
      });
    });
    expect(target).toBeTruthy();

    // Scroll #mainRow all the way right; the panel's right edge must then be
    // on-screen (it was previously clipped with no way to reach it).
    await page.evaluate(() => {
      const m = document.getElementById('mainRow');
      m.scrollLeft = m.scrollWidth;
    });
    const { right, mainRight } = await page.evaluate((id) => ({
      right: document.getElementById(id).getBoundingClientRect().right,
      mainRight: document.getElementById('mainRow').getBoundingClientRect().right,
    }), target);
    expect(right).toBeLessThanOrEqual(mainRight + 1);
    expect(right).toBeLessThanOrEqual(vp.width + 1);
  });

  test(`${vp.name}: no explicit pan slider (swipe only)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loadChart(page);
    await expect(page.locator('#mainRow ~ input[type="range"], #mainRowPan, #panSlider')).toHaveCount(0);
  });

  test(`${vp.name}: every toolbar control is within the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loadChart(page);
    const offenders = await page.evaluate((w) => {
      const out = [];
      for (const el of document.querySelectorAll('.toolbar > *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.right > w + 1) out.push((el.id || el.className || el.tagName) + ' @' + Math.round(r.right));
      }
      return out;
    }, vp.width);
    expect(offenders).toEqual([]);
  });

  test(`${vp.name}: transit bar fits the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loadChart(page);
    await page.locator('#viewDropdown .tb-btn').first().click();
    await page.locator('#viewMenu button:text-is("Transits")').click();
    await expect(page.locator('#transitBar')).toBeVisible();
    for (const id of ['trNowBtn', 'trTime', 'trDate', 'trSlider', 'trUnit', 'trLoc']) {
      const b = await page.locator('#' + id).boundingBox();
      expect(b, id).not.toBeNull();
      expect(b.x + b.width, id).toBeLessThanOrEqual(vp.width + 1);
    }
  });
}
