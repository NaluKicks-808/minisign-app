import { expect, test } from '@playwright/test';
import {
  actAs, box, expectReadOnly, expectStatus, fill, fillRecipientFields, freshStart,
  newDocumentFromSample, openFirstRow, signDrawn, signTyped,
} from './helpers';

test('golden path: Auto-prep', async ({ page }) => {
  await freshStart(page);
  await newDocumentFromSample(page);

  await page.getByTestId('autoprep-button').click();
  await expect(page.getByTestId('suggestion-box')).toHaveCount(17, { timeout: 30_000 });

  await page.locator('[data-testid="suggestion-box"][data-label="Fax"]').click({ force: true });
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByTestId('suggestion-box')).toHaveCount(16);

  await page.locator('[data-testid="suggestion-box"][data-label="Zip"]').click({ force: true });
  await page.getByLabel('Label', { exact: true }).fill('Postal Code');
  await page.getByLabel('Label', { exact: true }).blur();

  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.getByTestId('suggestion-box')).toHaveCount(0);
  await expect(page.getByTestId('field-box')).toHaveCount(16);
  await expect(page.locator('[data-testid="field-box"][data-origin="autoprep"]')).toHaveCount(16);
  await expect(box(page, 'Postal Code', 'recipient')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Fill' }).click();
  await fill(page, 'Title', 'Director', 'sender');
  await signTyped(page, 'Signature', 'sender', 'Dana Reyes');
  await page.getByLabel('Recipient', { exact: true }).selectOption('u_bob');
  await page.getByTestId('send-button').click();
  await expectStatus(page, 'sent');
  await expectReadOnly(page);

  await actAs(page, 'u_bob');
  await openFirstRow(page);
  await fill(page, 'Postal Code', '78701', 'recipient');
  await fillRecipientFields(page);
  await signDrawn(page, 'Signature', 'recipient');
  await expect(page.getByTestId('finish-button')).toBeEnabled();
  await page.getByTestId('finish-button').click();
  await expectStatus(page, 'completed');
  await expect(page.getByTestId('field-box')).toHaveCount(16);
  await expect(page.locator('[data-testid="field-box"][data-origin="autoprep"]')).toHaveCount(16);
  await expect(box(page, 'Print Name', 'recipient')).toContainText('Bob Smith');
  await expectReadOnly(page);
});
