const { test, expect } = require('@playwright/test');

// Help > Interface Tweaks (2026-10-30): a help page (static/InterfaceTweaks.md)
// describing every tweak, so people who don't like the look find the
// Settings > Interface Tweaks popover. Its footer button opens the popover.

test.beforeEach(async ({ page }) => {
  await page.route('**/static/Open.md**', route => route.fulfill({ body: '# Jyotish Query\n\nWelcome.' }));
  await page.addInitScript(() => localStorage.setItem('jyotish_hide_welcome', '1'));
  await page.goto('/');
});

async function openHelpTweaksPage(page) {
  await page.locator('#helpDropdown > .tb-btn').click();
  await page.locator('#helpMenu button:text-is("Interface Tweaks")').click();
  const content = page.locator('#helpTweaksContent');
  await expect(content).toContainText('Interface Tweaks');
  return content;
}

test('Interface Tweaks is in the Help menu, after Transit Control', async ({ page }) => {
  const items = await page.locator('#helpMenu button').allTextContents();
  expect(items[items.indexOf('Transit Control') + 1]).toBe('Interface Tweaks');
});

test('the page names every tweak in the popover', async ({ page }) => {
  const content = await openHelpTweaksPage(page);
  const text = await content.innerText();
  // Every group title and checkbox label in the popover, minus trailing detail in brackets.
  const labels = await page.locator('#dlgTweaks .tw-group-title, #dlgTweaks .stg-check').allTextContents();
  for (const raw of labels) {
    const l = raw.replace(/\(.*\)/, '').replace(/,.*$/, '').trim();
    if (l === 'Bold' || l === 'White') continue; // listed together as "Bold, White"
    expect(text, l).toContain(l);
  }
});

test('Open Interface Tweaks closes the help page and opens the popover', async ({ page }) => {
  await openHelpTweaksPage(page);
  await page.locator('#dlgHelpTweaks button:text-is("Open Interface Tweaks")').click();
  await expect(page.locator('#dlgHelpTweaks')).toBeHidden();
  await expect(page.locator('#dlgTweaks')).toBeVisible();
});
