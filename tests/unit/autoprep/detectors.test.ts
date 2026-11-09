// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import type { FieldSuggestion, PageContent } from '../../../src/domain/autoprep';
import { NotImplemented } from '../../../src/domain/errors';
import { createCompositeDetector } from '../../../src/features/autoprep/detectors';
import {
  MASTER_AGREEMENT_DECORATIVE_RULE,
  MASTER_AGREEMENT_EXPECTED,
  MASTER_AGREEMENT_PAGE,
  type ExpectedCell,
} from '../../fixtures/masterAgreement.expected';
import {
  generateSyntheticPdf,
  SYNTHETIC_PAGE,
  SYNTHETIC_PDF_PATH,
} from '../../fixtures/generateSyntheticPdf';
import { extract, pointsToNormalized, readBytes, referenceIou, SAMPLE_PATH } from './support';

// geometry.iou belongs to lane B. Until it lands the reference math stands in; once it does,
// the real function runs here and this fallback never fires.
vi.mock('../../../src/domain/geometry', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/domain/geometry')>();
  return {
    ...real,
    iou: (a: Parameters<typeof real.iou>[0], b: Parameters<typeof real.iou>[1]) => {
      try {
        return real.iou(a, b);
      } catch (error) {
        if (error instanceof NotImplemented) return referenceIou(a, b);
        throw error;
      }
    },
  };
});

const EPSILON = 0.0005;

function matchSample(suggestions: FieldSuggestion[], expected: ExpectedCell[], pageOf = (p: number) => p) {
  expect(suggestions).toHaveLength(expected.length);
  const remaining = [...suggestions];
  for (const cell of expected) {
    const page = pageOf(cell.page);
    const area = pointsToNormalized(
      { x0: cell.x0, x1: cell.x1, y0: cell.belowLabelFromY, y1: cell.y1 },
      MASTER_AGREEMENT_PAGE,
    );
    const at = remaining.findIndex((s) => s.page === page && referenceIou(s.rect, area) >= 0.5);
    expect(at, `no suggestion over ${cell.label} on page ${page}`).toBeGreaterThanOrEqual(0);
    const [found] = remaining.splice(at, 1) as [FieldSuggestion];
    expect({
      label: found.label,
      type: found.type,
      assignee: found.assignee,
      required: found.required,
      autoFillSigningDate: found.autoFillSigningDate,
    }).toEqual({
      label: cell.label,
      type: cell.type,
      assignee: cell.assignee,
      required: cell.required,
      autoFillSigningDate: cell.autoFillSigningDate,
    });
    const bounds = pointsToNormalized(cell, MASTER_AGREEMENT_PAGE);
    expect(found.rect.x).toBeGreaterThanOrEqual(bounds.x - EPSILON);
    expect(found.rect.y).toBeGreaterThanOrEqual(bounds.y - EPSILON);
    expect(found.rect.x + found.rect.w).toBeLessThanOrEqual(bounds.x + bounds.w + EPSILON);
    expect(found.rect.y + found.rect.h).toBeLessThanOrEqual(bounds.y + bounds.h + EPSILON);
  }
  expect(remaining).toEqual([]);
}

describe('master agreement sample', () => {
  it('gives exactly the 17 ground-truth suggestions and nothing from body text', async () => {
    const pages = await extract(readBytes(SAMPLE_PATH));
    matchSample(createCompositeDetector().detect(pages), MASTER_AGREEMENT_EXPECTED);
  });

  it('extracts the decorative rule, then ignores it', async () => {
    const pages = await extract(readBytes(SAMPLE_PATH));
    const { page, y, x0, x1 } = MASTER_AGREEMENT_DECORATIVE_RULE;
    const size = MASTER_AGREEMENT_PAGE;
    const content = pages[page - 1] as PageContent;
    const rule = content.rules.find(
      (r) =>
        Math.abs(r.y1 * size.heightPt - y) < 0.5 &&
        Math.abs(r.x1 * size.widthPt - x0) < 0.5 &&
        Math.abs(r.x2 * size.widthPt - x1) < 0.5,
    );
    expect(rule, 'extraction lost the rule, so this test would prove nothing').toBeDefined();
    const near = createCompositeDetector()
      .detect(pages)
      .filter((s) => s.page === page && Math.abs(s.rect.y * size.heightPt - y) < 30);
    expect(near).toEqual([]);
  });

  it('reads the shaded header bands', async () => {
    const [first, second] = await extract(readBytes(SAMPLE_PATH));
    const size = MASTER_AGREEMENT_PAGE;
    expect(first?.shadedRects).toHaveLength(1);
    expect((first?.shadedRects[0]?.y ?? 0) * size.heightPt).toBeCloseTo(100.4, 1);
    expect(second?.shadedRects).toHaveLength(1);
    expect((second?.shadedRects[0]?.y ?? 0) * size.heightPt).toBeCloseTo(376.9, 1);
  });

  it('follows the content when the pages are swapped', async () => {
    const source = await PDFDocument.load(readBytes(SAMPLE_PATH));
    const swapped = await PDFDocument.create();
    const copied = await swapped.copyPages(source, [1, 0]);
    copied.forEach((page) => swapped.addPage(page));
    const pages = await extract(await swapped.save());
    matchSample(createCompositeDetector().detect(pages), MASTER_AGREEMENT_EXPECTED, (p) => 3 - p);
  });
});

describe('synthetic underline form', () => {
  it('committed PDF matches its generator', async () => {
    const { bytes } = await generateSyntheticPdf();
    expect(Buffer.from(readBytes(SYNTHETIC_PDF_PATH)).equals(Buffer.from(bytes))).toBe(true);
  });

  it('gives its expected suggestions and nothing from the paragraph', async () => {
    const { expected } = await generateSyntheticPdf();
    const suggestions = createCompositeDetector().detect(await extract(readBytes(SYNTHETIC_PDF_PATH)));
    expect(suggestions.map((s) => s.label).sort()).toEqual(expected.map((e) => e.label).sort());
    const remaining = [...suggestions];
    for (const item of expected) {
      const area = pointsToNormalized(item, SYNTHETIC_PAGE);
      const at = remaining.findIndex((s) => s.label === item.label && referenceIou(s.rect, area) >= 0.5);
      expect(at, `no suggestion over ${item.label}`).toBeGreaterThanOrEqual(0);
      const [found] = remaining.splice(at, 1) as [FieldSuggestion];
      expect({
        type: found.type,
        assignee: found.assignee,
        required: found.required,
        autoFillSigningDate: found.autoFillSigningDate,
      }).toEqual({
        type: item.type,
        assignee: item.assignee,
        required: item.required,
        autoFillSigningDate: item.autoFillSigningDate,
      });
    }
  });
});
