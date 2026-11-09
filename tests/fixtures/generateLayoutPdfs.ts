/**
 * Page geometries and table shapes unlike the sample. Expected suggestions come from what this
 * file draws, never from detector output. Every coordinate here is what the reader sees: PDF
 * points from the top-left of the page as displayed, whatever the file does underneath.
 * Regenerate the committed files with: node tests/fixtures/generateLayoutPdfs.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';

export interface LayoutExpected {
  page: number;
  label: string;
  type: FieldType;
  autoFillSigningDate: boolean;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface LayoutPdf {
  name: string;
  bytes: Uint8Array;
  /** Displayed size of each page, in points. */
  pages: { widthPt: number; heightPt: number }[];
  expected: LayoutExpected[];
}

interface CaptionCell {
  label: string;
  caption?: string;
  type?: FieldType;
  autoFillSigningDate?: boolean;
}

const CAPTION_SIZE = 8;
const CAPTION_BOTTOM = 10.6;
const BODY_SIZE = 11;
const MARGIN = 40;
const black = rgb(0, 0, 0);

/** Draws in displayed coordinates; each page geometry supplies how those reach the file. */
class Surface {
  readonly expected: LayoutExpected[] = [];

  private readonly page: PDFPage;
  private readonly font: PDFFont;
  private readonly pageNumber: number;
  readonly width: number;
  private readonly toUser: (x: number, top: number) => { x: number; y: number };
  private readonly textRotation: number;

  constructor(
    page: PDFPage,
    font: PDFFont,
    pageNumber: number,
    width: number,
    toUser: (x: number, top: number) => { x: number; y: number },
    textRotation = 0,
  ) {
    this.page = page;
    this.font = font;
    this.pageNumber = pageNumber;
    this.width = width;
    this.toUser = toUser;
    this.textRotation = textRotation;
  }

  text(value: string, x: number, baseline: number, size = BODY_SIZE) {
    this.page.drawText(value, {
      ...this.toUser(x, baseline),
      size,
      font: this.font,
      color: black,
      rotate: degrees(this.textRotation),
    });
  }

  line(x0: number, top0: number, x1: number, top1: number) {
    this.page.drawLine({
      start: this.toUser(x0, top0),
      end: this.toUser(x1, top1),
      thickness: 0.75,
      color: black,
    });
  }

  add(
    label: string,
    type: FieldType,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    autoFillSigningDate = false,
  ) {
    this.expected.push({ page: this.pageNumber, label, type, autoFillSigningDate, x0, x1, y0, y1 });
  }

  /** A ruled table whose cells each carry a small caption above an empty writing space. */
  captionTable(rows: CaptionCell[][], left: number, right: number, top: number, rowHeight: number) {
    rows.forEach((row, r) => {
      const y0 = top + r * rowHeight;
      const y1 = y0 + rowHeight;
      const width = (right - left) / row.length;
      this.line(left, y0, right, y0);
      row.forEach((cell, c) => {
        const x0 = left + c * width;
        this.line(x0, y0, x0, y1);
        this.text(cell.caption ?? cell.label, x0 + 3, y0 + 8.5, CAPTION_SIZE);
        this.add(
          cell.label,
          cell.type ?? 'text',
          x0,
          x0 + width,
          y0 + CAPTION_BOTTOM,
          y1,
          cell.autoFillSigningDate,
        );
      });
      this.line(right, y0, right, y1);
    });
    const bottom = top + rows.length * rowHeight;
    this.line(left, bottom, right, bottom);
    return bottom;
  }

  ruledField(caption: string, label: string, type: FieldType, right: number, baseline: number) {
    this.text(caption, MARGIN, baseline);
    const x0 = MARGIN + this.font.widthOfTextAtSize(caption, BODY_SIZE) + 6;
    this.line(x0, baseline + 2, right, baseline + 2);
    this.add(label, type, x0, right, baseline + 2 - BODY_SIZE * 1.4, baseline + 2);
  }

  typedField(caption: string, label: string, type: FieldType, baseline: number) {
    const blanks = '_'.repeat(30);
    this.text(`${caption} ${blanks}`, MARGIN, baseline);
    const x0 = MARGIN + this.font.widthOfTextAtSize(`${caption} `, BODY_SIZE);
    const x1 = x0 + this.font.widthOfTextAtSize(blanks, BODY_SIZE);
    const bottom = baseline + BODY_SIZE * 0.2;
    this.add(label, type, x0, x1, bottom - BODY_SIZE * 1.4, bottom);
  }
}

/** The same small form, laid out against whatever width the page has. */
function drawStandardForm(s: Surface) {
  const right = s.width - MARGIN;
  s.text('Application form', MARGIN, 50, 14);
  const bottom = s.captionTable(
    [
      [{ label: 'Legal Name' }],
      [
        { label: 'Email', type: 'email' },
        { label: 'Phone', type: 'phone' },
      ],
      [{ label: 'City' }, { label: 'State' }, { label: 'Zip' }],
    ],
    MARGIN,
    right,
    70,
    30,
  );
  s.ruledField('Full name:', 'Full Name', 'text', right, bottom + 40);
  s.typedField('Mobile:', 'Mobile', 'phone', bottom + 70);
  s.text('Note: every entry is checked by the office, and copies are kept on file:', MARGIN, bottom + 110);
}

const WIDE_COLUMNS = ['Part', 'Size', 'Color', 'Weight', 'Origin', 'Batch', 'Grade', 'Lot'];
const WIDE_COLUMNS_2 = ['Maker', 'Model', 'Serial', 'Depot', 'Bay', 'Crew', 'Shift', 'Route'];

type Build = (doc: PDFDocument, font: PDFFont, out: Omit<LayoutPdf, 'name' | 'bytes'>) => void | Promise<void>;

const upright = (height: number) => (x: number, top: number) => ({ x, y: height - top });

function plainPage(
  doc: PDFDocument,
  font: PDFFont,
  out: Omit<LayoutPdf, 'name' | 'bytes'>,
  width: number,
  height: number,
  draw: (s: Surface) => void,
) {
  const number = out.pages.length + 1;
  const surface = new Surface(doc.addPage([width, height]), font, number, width, upright(height));
  draw(surface);
  out.pages.push({ widthPt: width, heightPt: height });
  out.expected.push(...surface.expected);
}

/** One tiny grey PNG, stretched over the page the way a scan would be. */
const GREY_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGO4AgAAxADDhbD8TgAAAABJRU5ErkJggg==';

const LAYOUTS: Record<string, Build> = {
  a4: (doc, font, out) => plainPage(doc, font, out, 595.28, 841.89, drawStandardForm),
  'us-legal': (doc, font, out) => plainPage(doc, font, out, 612, 1008, drawStandardForm),
  landscape: (doc, font, out) => plainPage(doc, font, out, 792, 612, drawStandardForm),

  'nonzero-mediabox': (doc, font, out) => {
    const [width, height, originX, originY] = [612, 792, 100, 200];
    const page = doc.addPage([width, height]);
    page.setMediaBox(originX, originY, width, height);
    const surface = new Surface(page, font, 1, width, (x, top) => ({
      x: x + originX,
      y: originY + height - top,
    }));
    drawStandardForm(surface);
    out.pages.push({ widthPt: width, heightPt: height });
    out.expected.push(...surface.expected);
  },

  // Rotate 90 turns the page clockwise, so content drawn turned back reads upright on screen.
  'rotate-90-upright': (doc, font, out) => {
    const [fileWidth, fileHeight] = [612, 792];
    const page = doc.addPage([fileWidth, fileHeight]);
    page.setRotation(degrees(90));
    const surface = new Surface(page, font, 1, fileHeight, (x, top) => ({ x: top, y: x }), 90);
    drawStandardForm(surface);
    out.pages.push({ widthPt: fileHeight, heightPt: fileWidth });
    out.expected.push(...surface.expected);
  },

  // The same flag over ordinary content: everything lies on its side on screen. Nothing to offer.
  'rotate-90-sideways': (doc, font, out) => {
    const [fileWidth, fileHeight] = [612, 792];
    const page = doc.addPage([fileWidth, fileHeight]);
    page.setRotation(degrees(90));
    drawStandardForm(new Surface(page, font, 1, fileWidth, upright(fileHeight)));
    out.pages.push({ widthPt: fileHeight, heightPt: fileWidth });
  },

  'wide-table': (doc, font, out) =>
    plainPage(doc, font, out, 612, 792, (s) => {
      s.captionTable(
        [WIDE_COLUMNS.map((label) => ({ label })), WIDE_COLUMNS_2.map((label) => ({ label }))],
        36,
        576,
        100,
        36,
      );
    }),

  // Rules and a page-sized image, with no text operators anywhere.
  'no-text-layer': async (doc, _font, out) => {
    const [width, height] = [612, 792];
    const page = doc.addPage([width, height]);
    const image = await doc.embedPng(Buffer.from(GREY_PIXEL_PNG, 'base64'));
    page.drawImage(image, { x: 0, y: 0, width, height, opacity: 0.1 });
    for (const top of [100, 130, 160]) {
      page.drawLine({ start: { x: 40, y: height - top }, end: { x: 572, y: height - top }, thickness: 0.75, color: black });
    }
    for (const x of [40, 306, 572]) {
      page.drawLine({ start: { x, y: height - 100 }, end: { x, y: height - 160 }, thickness: 0.75, color: black });
    }
    page.drawRectangle({ x: 40, y: height - 90, width: 532, height: 20, color: rgb(0.8, 0.8, 0.8) });
    out.pages.push({ widthPt: width, heightPt: height });
  },

  // Rows drawn as full-width rules with only the inner column line, as tax forms do.
  'open-sided-rows': (doc, font, out) =>
    plainPage(doc, font, out, 612, 792, (s) => {
      const [left, middle, right, top, rowHeight] = [40, 340, 572, 100, 30];
      [0, 1, 2].forEach((r) => s.line(left, top + r * rowHeight, right, top + r * rowHeight));
      s.line(middle, top, middle, top + 2 * rowHeight);
      const row = (r: number, a: string, b: string) => {
        const y0 = top + r * rowHeight;
        s.text(a, left + 3, y0 + 8.5, CAPTION_SIZE);
        s.text(b, middle + 3, y0 + 8.5, CAPTION_SIZE);
        s.add(a, 'text', left, middle, y0 + CAPTION_BOTTOM, y0 + rowHeight);
        s.add(b, 'text', middle, right, y0 + CAPTION_BOTTOM, y0 + rowHeight);
      };
      row(0, 'Given Names', 'Tax Number');
      row(1, 'Street', 'Suburb');
    }),

  // Stacked rules with captions beneath and no column line: closing them would mislabel the blanks.
  'stacked-rules': (doc, font, out) =>
    plainPage(doc, font, out, 612, 792, (s) => {
      [100, 150, 200].forEach((top, i) => {
        s.line(40, top, 300, top);
        s.text(['Witness', 'Occupation', 'Residence'][i] ?? '', 40, top + 9, CAPTION_SIZE);
      });
    }),

  // An information table: a short entry beside a paragraph is not a field.
  'reference-table': (doc, font, out) =>
    plainPage(doc, font, out, 612, 792, (s) => {
      const [left, middle, right, top, rowHeight] = [40, 180, 572, 100, 60];
      [0, 1, 2].forEach((r) => s.line(left, top + r * rowHeight, right, top + r * rowHeight));
      [left, middle, right].forEach((x) => s.line(x, top, x, top + 2 * rowHeight));
      [0, 1].forEach((r) => {
        const y0 = top + r * rowHeight;
        s.text(r === 0 ? 'Started a business' : 'Opened an account', left + 3, y0 + 9, CAPTION_SIZE);
        s.text('Complete the lines that apply to the entity and leave every other', middle + 3, y0 + 12, 8);
        s.text('line on this page empty, then send the signed form to the office', middle + 3, y0 + 24, 8);
        s.text('that serves your county before the end of the next calendar month', middle + 3, y0 + 36, 8);
      });
    }),

  // One table for the whole form: only the rows by the signature are its signature block.
  'one-table': (doc, font, out) =>
    plainPage(doc, font, out, 612, 792, (s) => {
      s.captionTable(
        [
          [{ label: 'Company Legal Name' }],
          [{ label: 'Date of Birth', type: 'date' }],
          [{ label: 'Date', type: 'date' }],
          [{ label: 'Contact Name' }],
          [{ label: 'Inspection Date', type: 'date' }],
          [{ label: 'Effective Date', type: 'date' }],
          [{ label: 'Reference' }],
          [{ label: 'Signature', type: 'signature' }],
          [
            { label: 'Print Name', type: 'signerName' },
            { label: 'Date', type: 'date', autoFillSigningDate: true },
          ],
        ],
        40,
        572,
        80,
        32,
      );
    }),

  'two-page': (doc, font, out) => {
    plainPage(doc, font, out, 612, 792, (s) => {
      s.text('Part one', MARGIN, 50, 14);
      s.captionTable(
        [[{ label: 'Customer Name' }], [{ label: 'Email', type: 'email' }, { label: 'City' }]],
        MARGIN,
        572,
        80,
        32,
      );
    });
    plainPage(doc, font, out, 595.28, 841.89, (s) => {
      s.text('Part two', MARGIN, 50, 14);
      s.captionTable(
        [
          [{ label: 'Signature', type: 'signature' }],
          [
            { label: 'Print Name', type: 'signerName' },
            { label: 'Date', type: 'date', autoFillSigningDate: true },
          ],
        ],
        MARGIN,
        555,
        600,
        36,
      );
    });
  },
};

export async function generateLayoutPdf(name: string): Promise<LayoutPdf> {
  const build = LAYOUTS[name];
  if (!build) throw new Error(`No layout called ${name}`);
  const doc = await PDFDocument.create();
  // Fixed dates keep the output byte-for-byte reproducible.
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const out: Omit<LayoutPdf, 'name' | 'bytes'> = { pages: [], expected: [] };
  await build(doc, font, out);
  return { name, bytes: await doc.save({ useObjectStreams: false }), ...out };
}

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

export const layoutPdfPath = (name: string) =>
  fileURLToPath(new URL(`./layouts/${name}.pdf`, import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(fileURLToPath(new URL('./layouts/', import.meta.url)), { recursive: true });
  for (const name of LAYOUT_NAMES) writeFileSync(layoutPdfPath(name), (await generateLayoutPdf(name)).bytes);
}
