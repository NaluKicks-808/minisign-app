import { expect, test } from '@playwright/test';
import { freshStart, newDocumentFromSample } from './helpers';

test('a field can be placed and moved with the keyboard alone', async ({ page }) => {
  await freshStart(page);
  await newDocumentFromSample(page);
  await page.getByTestId('palette-text').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('place-on-page').focus();
  await page.keyboard.press('Enter');
  const field = page.getByTestId('field-box');
  await expect(field).toHaveCount(1);
  const before = await field.boundingBox();
  await page.getByTestId('palette-text').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await field.boundingBox())!.y).toBeGreaterThan(before!.y);
});

test('Reset demo data asks first and keeps documents on no', async ({ page }) => {
  await freshStart(page);
  await newDocumentFromSample(page);
  await page.getByRole('link', { name: 'MiniSign' }).click();
  const docs = page.getByRole('link', { name: /Lone Star/ });
  await expect(docs).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('button', { name: 'Keep my documents' }).click();
  await expect(docs).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await page.getByRole('button', { name: 'Erase and start over' }).click();
  await expect(docs).toHaveCount(0);
});
