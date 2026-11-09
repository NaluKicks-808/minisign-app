import { expect, test } from '@playwright/test';
import {
  H, TARGETS, W, actAs, box, expectReadOnly, expectStatus, fill, fillRecipientFields, freshStart,
  newDocumentFromSample, openFirstRow, signDrawn, signTyped, todayLocal,
} from './helpers';

test('golden path: manual layout', async ({ page }) => {
  await freshStart(page);
  await newDocumentFromSample(page);

  for (const t of TARGETS) {
    const surface = page.getByTestId(`page-surface-${t.page}`);
    await surface.scrollIntoViewIfNeeded();
    await page.getByTestId(`palette-${t.palette}`).click();
    const before = await page.getByTestId('field-box').count();
    const b = (await surface.boundingBox())!;
    const cx = b.x + (((t.x0 + t.x1) / 2) / W) * b.width;
    const cy = b.y + (((t.belowY + t.y1) / 2) / H) * b.height;
    await page.mouse.click(cx, cy);
    await expect(page.getByTestId('field-box')).toHaveCount(before + 1);
    const created = page.getByTestId('field-box').last();
    await created.click({ force: true });
    await page.getByLabel('Label', { exact: true }).fill(t.label);
    await page.getByLabel('Label', { exact: true }).blur();
    await page.getByLabel('Assignee').selectOption(t.assignee);
    const required = page.getByLabel('Required');
    if ((await required.isChecked()) !== t.required) await required.click();
    if (t.autoDate) await page.getByLabel('Fill in the signing date').check();
  }
  await expect(page.getByTestId('field-box')).toHaveCount(17);

  // Drag one box a little and check that it moved.
  const fax = box(page, 'Fax');
  const start = (await fax.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 3, { steps: 4 });
  await page.mouse.up();
  const moved = (await fax.boundingBox())!;
  expect(Math.abs(moved.x - start.x)).toBeGreaterThan(4);

  await page.getByRole('tab', { name: 'Fill' }).click();
  await expect(page.getByTestId('send-button')).toBeDisabled();
  await expect(page.getByTestId('blocking-reasons')).toContainText('Choose a recipient');
  await expect(page.getByTestId('blocking-reasons')).toContainText('Signature');

  await fill(page, 'Title', 'Director', 'sender');
  await signTyped(page, 'Signature', 'sender', 'Dana Reyes');
  await page.getByLabel('Recipient', { exact: true }).selectOption('u_bob');
  await expect(page.getByTestId('send-button')).toBeEnabled();
  await page.getByTestId('send-button').click();

  await expectStatus(page, 'sent');
  await expectReadOnly(page);

  await actAs(page, 'u_bob');
  await expect(page.getByTestId('document-row')).toHaveCount(1);
  await expect(page.getByTestId('document-row')).toContainText('Needs your action');
  await openFirstRow(page);

  await expect(box(page, 'Print Name', 'sender')).toContainText('Dana Reyes');
  await expect(box(page, 'Title', 'sender').locator('input:not([disabled]):not([readonly])')).toHaveCount(0);

  await fillRecipientFields(page, { Email: 'bob@nowhere', Phone: '12' });
  await signDrawn(page, 'Signature', 'recipient');
  await expect(page.getByTestId('finish-button')).toBeDisabled();
  await expect(page.getByTestId('blocking-reasons')).toContainText('Email');
  await expect(page.getByTestId('blocking-reasons')).toContainText('Phone');

  await fill(page, 'Email', 'bob@acmetrucking.example', 'recipient');
  await fill(page, 'Phone', '512-555-0100', 'recipient');
  await expect(page.getByTestId('finish-button')).toBeEnabled();
  await page.getByTestId('finish-button').click();

  await expectStatus(page, 'completed');
  await expect(box(page, 'Print Name', 'recipient')).toContainText('Bob Smith');
  await expect(box(page, 'Date', 'recipient')).toContainText(todayLocal());
  await expectReadOnly(page);

  await actAs(page, 'u_maria');
  await expect(page.getByTestId('document-row')).toHaveCount(0);
});
