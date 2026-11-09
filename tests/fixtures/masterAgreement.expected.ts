/** PRD §10.3 ground truth: PDF points, top-left origin, measured from the sample file. */
import type { Assignee, FieldType } from '../../src/domain/types';

export const MASTER_AGREEMENT_PAGE = { widthPt: 612, heightPt: 792 };

export interface ExpectedCell {
  page: number;
  label: string;
  type: FieldType;
  assignee: Assignee;
  required: boolean;
  autoFillSigningDate: boolean;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  belowLabelFromY: number;
}

const cell = (
  page: number,
  label: string,
  type: FieldType,
  assignee: Assignee,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  belowLabelFromY: number,
  required = true,
): ExpectedCell => ({
  page,
  label,
  type,
  assignee,
  required,
  autoFillSigningDate: type === 'date',
  x0,
  x1,
  y0,
  y1,
  belowLabelFromY,
});

export const MASTER_AGREEMENT_EXPECTED: ExpectedCell[] = [
  cell(1, 'Customer Legal Name', 'text', 'recipient', 54, 558, 116.4, 136.4, 124.9),
  cell(1, 'Purchasing Agent', 'text', 'recipient', 54, 255.6, 136.4, 156.4, 144.9),
  cell(1, 'Email', 'email', 'recipient', 255.6, 558, 136.4, 156.4, 144.9),
  cell(1, 'Address', 'text', 'recipient', 54, 255.6, 156.4, 176.4, 164.9),
  cell(1, 'City', 'text', 'recipient', 255.6, 406.8, 156.4, 176.4, 164.9),
  cell(1, 'State', 'text', 'recipient', 406.8, 482.4, 156.4, 176.4, 164.9),
  cell(1, 'Zip', 'text', 'recipient', 482.4, 558, 156.4, 176.4, 164.9),
  cell(1, 'Phone', 'phone', 'recipient', 54, 255.6, 176.4, 196.4, 184.9),
  cell(1, 'Fax', 'phone', 'recipient', 255.6, 558, 176.4, 196.4, 184.9, false),
  cell(2, 'Signature', 'signature', 'sender', 54, 306, 392.9, 426.9, 401.1),
  cell(2, 'Print Name', 'signerName', 'sender', 54, 217.8, 426.9, 448.9, 435.1),
  cell(2, 'Date', 'date', 'sender', 217.8, 306, 426.9, 448.9, 435.1),
  cell(2, 'Title', 'text', 'sender', 54, 306, 448.9, 470.9, 457.1),
  cell(2, 'Signature', 'signature', 'recipient', 306, 558, 392.9, 426.9, 401.1),
  cell(2, 'Print Name', 'signerName', 'recipient', 306, 469.8, 426.9, 448.9, 435.1),
  cell(2, 'Date', 'date', 'recipient', 469.8, 558, 426.9, 448.9, 435.1),
  cell(2, 'Title', 'text', 'recipient', 306, 558, 448.9, 470.9, 457.1),
];

/** The decorative rule under the email link on page 2: drawn, but never a field. */
export const MASTER_AGREEMENT_DECORATIVE_RULE = { page: 2, y: 334.6, x0: 72, x1: 211.5 };
