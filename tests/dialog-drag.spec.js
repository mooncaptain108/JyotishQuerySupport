const { test, expect } = require('@playwright/test');

// Dialog dragging (makeDraggable) uses pointer events + touch-action:none on
// .dlg-header, so a finger drag moves the dialog on phones/tablets as well as
// a mouse drag on desktop. It used to be mouse-only: touch did nothing.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jyotish_hide_welcome', '1'));
  await page.route('**/static/Open.md**', route =>
    route.fulfill({ body: '# Jyotish Query\n\nWelcome.' })
  );
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.getElementById('dlgTransits').showModal());
});

async function headerPoint(page) {
  const b = await page.locator('#dlgTransits .dlg-header h2').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function dlgPos(page) {
  const b = await page.locator('#dlgTransits').boundingBox();
  return { x: b.x, y: b.y };
}

test('mouse drag on the header moves the dialog', async ({ page }) => {
  const before = await dlgPos(page);
  const p = await headerPoint(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 40, { steps: 5 });
  await page.mouse.up();
  const after = await dlgPos(page);
  expect(after.x - before.x).toBeCloseTo(60, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);
});

test('touch drag on the header moves the dialog', async ({ page }) => {
  expect(await page.evaluate(() =>
    getComputedStyle(document.querySelector('#dlgTransits .dlg-header')).touchAction)).toBe('none');

  const before = await dlgPos(page);
  const p = await headerPoint(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
  await touch('touchStart', p.x, p.y);
  for (let i = 1; i <= 5; i++) await touch('touchMove', p.x + 12 * i, p.y + 8 * i);
  await touch('touchEnd');
  const after = await dlgPos(page);
  expect(after.x - before.x).toBeCloseTo(60, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);
});

test('tapping ✕ still closes the dialog', async ({ page }) => {
  await page.locator('#dlgTransits .dlg-close-x').click();
  await expect(page.locator('#dlgTransits')).not.toBeVisible();
});
