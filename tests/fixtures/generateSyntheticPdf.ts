/**
 * PRD §10.4: a layout unlike the sample, to prove the detector is general. Expected suggestions
 * come from what this file draws, never from detector output.
 * Regenerate the committed file with: node tests/fixtures/generateSyntheticPdf.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';
type Assignee = 'sender' | 'recipient';

export interface SyntheticExpected {
  page: number;
  label: string;
  type: FieldType;
  assignee: Assignee;
  required: boolean;
  autoFillSigningDate: boolean;
  /** Where the writing space is: PDF points, top-left origin. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const SYNTHETIC_PAGE = { widthPt: 612, heightPt: 792 };

const HEIGHT = SYNTHETIC_PAGE.heightPt;
const LEFT = 72;
const RIGHT = 540;
const FONT_SIZE = 11;
const FIELD_HEIGHT = FONT_SIZE * 1.4;
const GAP = 6;

export async function generateSyntheticPdf(): Promise<{
  bytes: Uint8Array;
  expected: SyntheticExpected[];
}> {
  const pdf = await PDFDocument.create();
  // Fixed dates keep the output byte-for-byte reproducible.
  pdf.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([SYNTHETIC_PAGE.widthPt, SYNTHETIC_PAGE.heightPt]);
  const black = rgb(0, 0, 0);

  const text = (value: string, x: number, top: number, usedFont = font, size = FONT_SIZE) =>
    page.drawText(value, { x, y: HEIGHT - top, size, font: usedFont, color: black });
  const rule = (x0: number, x1: number, top: number) =>
    page.drawLine({
      start: { x: x0, y: HEIGHT - top },
      end: { x: x1, y: HEIGHT - top },
      thickness: 0.75,
      color: black,
    });

  const expected: SyntheticExpected[] = [];
  const add = (
    label: string,
    type: FieldType,
    assignee: Assignee,
    x0: number,
    x1: number,
    bottom: number,
    autoFillSigningDate = false,
  ) =>
    expected.push({
      page: 1,
      label,
      type,
      assignee,
      required: true,
      autoFillSigningDate,
      x0,
      x1,
      y0: bottom - FIELD_HEIGHT,
      y1: bottom,
    });

  text('New hire form', LEFT, 70, bold, 16);

  /** "Label:" with the blank drawn as a line. */
  const ruledLine = (caption: string, label: string, type: FieldType, top: number) => {
    text(caption, LEFT, top);
    const x0 = LEFT + font.widthOfTextAtSize(caption, FONT_SIZE) + GAP;
    rule(x0, RIGHT, top + 2);
    add(label, type, 'recipient', x0, RIGHT, top + 2);
  };
  /** "Label: ______" with the blank typed as underscores, all in one text run. */
  const typedLine = (caption: string, label: string, type: FieldType, top: number) => {
    const blanks = '_'.repeat(44);
    text(`${caption} ${blanks}`, LEFT, top);
    const x0 = LEFT + font.widthOfTextAtSize(`${caption} `, FONT_SIZE);
    const x1 = x0 + font.widthOfTextAtSize(blanks, FONT_SIZE);
    add(label, type, 'recipient', x0, x1, top + FONT_SIZE * 0.2);
  };

  ruledLine('Full name:', 'Full Name', 'text', 110);
  ruledLine('E-mail:', 'E-mail', 'email', 140);
  typedLine('Mobile:', 'Mobile', 'phone', 170);
  typedLine('Start date:', 'Start Date', 'date', 200);
  ruledLine('Notes:', 'Notes', 'text', 230);

  // Prose full of colons: none of these may become a field.
  text('Important: all entries must be accurate, and HR will review the following:', LEFT, 280);
  text('your eligibility, your start date, and your contact details. Note: keep a copy.', LEFT, 294);
  text('Questions go to the people team, in writing, using the address below:', LEFT, 308);

  text('Company', LEFT, 380, bold, 12);
  text('Employee', 320, 380, bold, 12);

  const signatureColumn = (assignee: Assignee, x: number, end: number) => {
    const signTop = 420;
    const signCaption = 'Sign here:';
    const signX = x + font.widthOfTextAtSize(signCaption, FONT_SIZE) + GAP;
    text(signCaption, x, signTop);
    rule(signX, end, signTop + 2);
    add('Sign Here', 'signature', assignee, signX, end, signTop + 2);

    const dateTop = 450;
    const dateCaption = 'Date:';
    const dateX = x + font.widthOfTextAtSize(dateCaption, FONT_SIZE) + GAP;
    text(dateCaption, x, dateTop);
    rule(dateX, end, dateTop + 2);
    add('Date', 'date', assignee, dateX, end, dateTop + 2, true);
  };
  signatureColumn('sender', LEFT, 290);
  signatureColumn('recipient', 320, RIGHT);

  return { bytes: await pdf.save({ useObjectStreams: false }), expected };
}

export const SYNTHETIC_PDF_PATH = fileURLToPath(
  new URL('./synthetic-underline-form.pdf', import.meta.url),
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bytes } = await generateSyntheticPdf();
  writeFileSync(SYNTHETIC_PDF_PATH, bytes);
}
