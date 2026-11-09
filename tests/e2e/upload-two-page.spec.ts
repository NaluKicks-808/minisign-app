import { expect, test } from '@playwright/test';
import { freshStart } from './helpers';
import { generateLayoutPdf, layoutPdfPath } from '../fixtures/generateLayoutPdfs';

const PDF = layoutPdfPath('two-page');

test('upload a two-page PDF: every suggestion lands on the page it belongs to', async ({ page }) => {
  const { expected, pages } = await generateLayoutPdf('two-page');
  await freshStart(page);
  await page.getByRole('link', { name: 'New document' }).or(page.getByRole('button', { name: 'New document' })).first().click();
  await page.getByLabel('Upload a PDF').setInputFiles(PDF);
  await expect(page).toHaveURL(/\/documents\//);
  await expect(page.locator('[data-testid="page-surface-2"] canvas')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('autoprep-button').click();
  await expect(page.getByTestId('suggestion-box')).toHaveCount(expected.length, { timeout: 30_000 });

  for (const item of expected) {
    const surface = page.getByTestId(`page-surface-${item.page}`);
    const box = surface.locator(`[data-testid="suggestion-box"][data-label="${item.label}"]`);
    await expect(box, `${item.label} on page ${item.page}`).toHaveCount(1);
    await expect(box).toHaveAttribute('data-field-type', item.type);

    await box.scrollIntoViewIfNeeded();
    const size = pages[item.page - 1];
    const [surfaceRect, boxRect] = await Promise.all([surface.boundingBox(), box.boundingBox()]);
    if (!size || !surfaceRect || !boxRect) throw new Error(`${item.label} has no measurable position`);
    const centerX = (boxRect.x + boxRect.width / 2 - surfaceRect.x) / surfaceRect.width;
    const centerY = (boxRect.y + boxRect.height / 2 - surfaceRect.y) / surfaceRect.height;
    expect(centerX).toBeGreaterThan(item.x0 / size.widthPt);
    expect(centerX).toBeLessThan(item.x1 / size.widthPt);
    expect(centerY).toBeGreaterThan(item.y0 / size.heightPt);
    expect(centerY).toBeLessThan(item.y1 / size.heightPt);
  }

  for (const surfacePage of [1, 2]) {
    const onPage = expected.filter((e) => e.page === surfacePage).length;
    await expect(
      page.getByTestId(`page-surface-${surfacePage}`).getByTestId('suggestion-box'),
    ).toHaveCount(onPage);
  }
});
