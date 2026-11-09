import { expect, test, type Page } from '@playwright/test';
import {
  H, TARGETS, W, box, expectReadOnly, expectStatus, finishAsBob, freshStart, sendViaAutoPrep,
} from './helpers';

async function relativeRects(page: Page) {
  return page.getByTestId('field-box').evaluateAll((els) =>
    els.map((el) => {
      const surface = el.closest('[data-testid^="page-surface-"]')!;
      const s = surface.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute('data-field-id')!,
        label: el.getAttribute('data-field-label')!,
        assignee: el.getAttribute('data-assignee')!,
        page: Number(surface.getAttribute('data-testid')!.replace('page-surface-', '')),
        x: (r.left - s.left) / s.width,
        y: (r.top - s.top) / s.height,
        w: r.width / s.width,
        h: r.height / s.height,
      };
    }),
  );
}

test('resize keeps every field on its spot', async ({ page }) => {
  await sendViaAutoPrep(page);
  await finishAsBob(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(600);
  const wide = await relativeRects(page);
  expect(wide).toHaveLength(17);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(800);
  const narrow = await relativeRects(page);
  for (const a of wide) {
    const b = narrow.find((n) => n.id === a.id)!;
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.005);
    const t = TARGETS.find((c) => c.page === a.page && c.label === a.label && c.assignee === a.assignee)!;
    const cx = (b.x + b.w / 2) * W;
    const cy = (b.y + b.h / 2) * H;
    expect(cx).toBeGreaterThan(t.x0);
    expect(cx).toBeLessThan(t.x1);
    expect(cy).toBeGreaterThan(t.y0);
    expect(cy).toBeLessThan(t.y1);
  }
});

test('reload in a sent state keeps status, values, user and lock', async ({ page }) => {
  await sendViaAutoPrep(page);
  await page.reload();
  await expect(page.getByLabel('Acting as')).toHaveValue('u_dana');
  await expectStatus(page, 'sent');
  await expect(box(page, 'Print Name', 'sender')).toContainText('Dana Reyes');
  await expect(box(page, 'Title', 'sender')).toContainText('Director');
  await expectReadOnly(page);
});

test('tamper button flips the integrity badge', async ({ page }) => {
  await sendViaAutoPrep(page);
  await finishAsBob(page);
  await page.goto(`${new URL(page.url()).pathname}?debug=1`);
  await expect(page.getByTestId('integrity-badge')).toContainText('intact');
  await page.getByTestId('tamper-button').click();
  await expect(page.getByTestId('integrity-badge')).toContainText(/altered at event #\d+/);
});

test('uploaded PDF gets suggestions on the right page', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('link', { name: 'New document' }).or(page.getByRole('button', { name: 'New document' })).first().click();
  await page.getByLabel('Upload a PDF').setInputFiles('tests/fixtures/synthetic-underline-form.pdf');
  await expect(page).toHaveURL(/\/documents\//);
  await expect(page.locator('[data-testid="page-surface-1"] canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('autoprep-button').click();
  await expect(page.locator('[data-testid="suggestion-box"][data-page="1"]').first()).toBeVisible({ timeout: 30_000 });
  expect(await page.getByTestId('suggestion-box').count()).toBeGreaterThanOrEqual(5);
});
