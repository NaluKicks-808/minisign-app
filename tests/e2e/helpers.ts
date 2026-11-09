import { expect, type Locator, type Page } from '@playwright/test';

export const W = 612;
export const H = 792;

export interface Target {
  page: number;
  label: string;
  palette: 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';
  assignee: 'sender' | 'recipient';
  required: boolean;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  belowY: number;
  autoDate?: boolean;
}

const row = (
  page: number,
  label: string,
  palette: Target['palette'],
  assignee: Target['assignee'],
  required: boolean,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  belowY: number,
  autoDate = false,
): Target => ({ page, label, palette, assignee, required, x0, x1, y0, y1, belowY, autoDate });

/** PRD §10.3 ground truth, in PDF points. */
export const TARGETS: Target[] = [
  row(1, 'Customer Legal Name', 'text', 'recipient', true, 54, 558, 116.4, 136.4, 124.9),
  row(1, 'Purchasing Agent', 'text', 'recipient', true, 54, 255.6, 136.4, 156.4, 144.9),
  row(1, 'Email', 'email', 'recipient', true, 255.6, 558, 136.4, 156.4, 144.9),
  row(1, 'Address', 'text', 'recipient', true, 54, 255.6, 156.4, 176.4, 164.9),
  row(1, 'City', 'text', 'recipient', true, 255.6, 406.8, 156.4, 176.4, 164.9),
  row(1, 'State', 'text', 'recipient', true, 406.8, 482.4, 156.4, 176.4, 164.9),
  row(1, 'Zip', 'text', 'recipient', true, 482.4, 558, 156.4, 176.4, 164.9),
  row(1, 'Phone', 'phone', 'recipient', true, 54, 255.6, 176.4, 196.4, 184.9),
  row(1, 'Fax', 'phone', 'recipient', false, 255.6, 558, 176.4, 196.4, 184.9),
  row(2, 'Signature', 'signature', 'sender', true, 54, 306, 392.9, 426.9, 401.1),
  row(2, 'Print Name', 'signerName', 'sender', true, 54, 217.8, 426.9, 448.9, 435.1),
  row(2, 'Date', 'date', 'sender', true, 217.8, 306, 426.9, 448.9, 435.1, true),
  row(2, 'Title', 'text', 'sender', true, 54, 306, 448.9, 470.9, 457.1),
  row(2, 'Signature', 'signature', 'recipient', true, 306, 558, 392.9, 426.9, 401.1),
  row(2, 'Print Name', 'signerName', 'recipient', true, 306, 469.8, 426.9, 448.9, 435.1),
  row(2, 'Date', 'date', 'recipient', true, 469.8, 558, 426.9, 448.9, 435.1, true),
  row(2, 'Title', 'text', 'recipient', true, 306, 558, 448.9, 470.9, 457.1),
];

export async function freshStart(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.getByLabel('Acting as')).toBeVisible();
}

export async function actAs(page: Page, id: string): Promise<void> {
  await page.getByLabel('Acting as').selectOption(id);
  await expect(page).toHaveURL(/\/$/);
}

export async function newDocumentFromSample(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'New document' }).or(page.getByRole('button', { name: 'New document' })).first().click();
  await page.getByRole('button', { name: 'Use this document' }).first().click();
  await expect(page).toHaveURL(/\/documents\//);
  await expect(page.locator('[data-testid="page-surface-2"] canvas')).toBeVisible({ timeout: 30_000 });
}

export function box(page: Page, label: string, assignee?: 'sender' | 'recipient'): Locator {
  const a = assignee ? `[data-assignee="${assignee}"]` : '';
  return page.locator(`[data-testid="field-box"][data-field-label="${label}"]${a}`);
}

export function input(page: Page, label: string, assignee?: 'sender' | 'recipient'): Locator {
  return box(page, label, assignee).getByTestId('field-input');
}

export async function fill(page: Page, label: string, value: string, assignee?: 'sender' | 'recipient'): Promise<void> {
  const el = input(page, label, assignee);
  await el.fill(value);
  await el.blur();
}

export async function signTyped(page: Page, label: string, assignee: 'sender' | 'recipient', name: string): Promise<void> {
  await input(page, label, assignee).click();
  const modal = page.getByTestId('signature-modal');
  await expect(modal).toBeVisible();
  await modal.getByRole('tab', { name: 'Type' }).click();
  await modal.getByLabel('Type your name').fill(name);
  await modal.getByRole('button', { name: 'Apply' }).click();
  await expect(modal).toBeHidden();
}

export async function signDrawn(page: Page, label: string, assignee: 'sender' | 'recipient'): Promise<void> {
  await input(page, label, assignee).click();
  const modal = page.getByTestId('signature-modal');
  await expect(modal).toBeVisible();
  await modal.getByRole('tab', { name: 'Draw' }).click();
  const canvas = modal.getByTestId('signature-canvas');
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(b.x + 30 + i * 18, b.y + 40 + (i % 2 ? 24 : -8));
  }
  await page.mouse.up();
  await modal.getByRole('button', { name: 'Apply' }).click();
  await expect(modal).toBeHidden();
}

export async function fillRecipientFields(page: Page, overrides: Record<string, string> = {}): Promise<void> {
  const values: Record<string, string> = {
    'Customer Legal Name': 'Acme Trucking LLC',
    'Purchasing Agent': 'Bob Smith',
    Email: 'bob@acmetrucking.example',
    Address: '1 Depot Road',
    City: 'Austin',
    State: 'TX',
    Zip: '78701',
    Phone: '512-555-0100',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (await box(page, label, 'recipient').count()) await fill(page, label, value, 'recipient');
  }
  await fill(page, 'Title', 'Owner', 'recipient');
}

export function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function openFirstRow(page: Page): Promise<void> {
  const row = page.getByTestId('document-row').first();
  const link = row.getByRole('link').first();
  if (await link.count()) await link.click();
  else await row.click();
  await expect(page).toHaveURL(/\/documents\//);
  await expect(page.locator('[data-testid="page-surface-2"] canvas')).toBeVisible({ timeout: 30_000 });
}

export async function expectStatus(page: Page, status: string): Promise<void> {
  await expect(page.getByTestId('status-badge').first()).toHaveText(new RegExp(status, 'i'));
}

/** No field offers an editable control. */
export async function expectReadOnly(page: Page): Promise<void> {
  const editable = page.locator(
    '[data-testid="field-box"] input:not([disabled]):not([readonly]), [data-testid="field-box"] button[data-testid="field-input"]:not([disabled])',
  );
  await expect(editable).toHaveCount(0);
}

/** PRD §13.2.1: every sender value shows on the recipient's view, and none of them is editable. */
export async function expectSenderValues(page: Page, values: { title: string; signature: string; name: string }): Promise<void> {
  await expect(box(page, 'Print Name', 'sender')).toContainText(values.name);
  await expect(box(page, 'Title', 'sender')).toContainText(values.title);
  await expect(box(page, 'Signature', 'sender')).toContainText(values.signature);
  await expect(box(page, 'Date', 'sender')).toContainText(todayLocal());
  for (const label of ['Print Name', 'Title', 'Signature', 'Date']) {
    await expect(
      box(page, label, 'sender').locator('input:not([disabled]):not([readonly]), button[data-testid="field-input"]:not([disabled])'),
    ).toHaveCount(0);
  }
}

/** The blocking list names this field and says its value is invalid; "<label> is required" fails this. */
export async function expectInvalidValueReason(page: Page, label: string): Promise<void> {
  const reasons = page.getByTestId('blocking-reasons');
  await expect(reasons.getByRole('button', { name: new RegExp(`^${label}\\b.*\\bvalid\\b`, 'i') })).toHaveCount(1);
  await expect(reasons).not.toContainText(`${label} is required`);
}

/** Auto-prep, accept all 17, send to Bob. Leaves Dana on the sent document. */
export async function sendViaAutoPrep(page: Page): Promise<void> {
  await freshStart(page);
  await newDocumentFromSample(page);
  await page.getByTestId('autoprep-button').click();
  await expect(page.getByTestId('suggestion-box')).toHaveCount(17, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.getByTestId('field-box')).toHaveCount(17);
  await page.getByRole('tab', { name: 'Fill' }).click();
  await fill(page, 'Title', 'Director', 'sender');
  await signTyped(page, 'Signature', 'sender', 'Dana Reyes');
  await page.getByLabel('Recipient', { exact: true }).selectOption('u_bob');
  await page.getByTestId('send-button').click();
  await expectStatus(page, 'sent');
}

/** Continues from sendViaAutoPrep: Bob fills in, signs and finishes. */
export async function finishAsBob(page: Page): Promise<void> {
  await actAs(page, 'u_bob');
  await openFirstRow(page);
  await fillRecipientFields(page);
  await signDrawn(page, 'Signature', 'recipient');
  await page.getByTestId('finish-button').click();
  await expectStatus(page, 'completed');
}
