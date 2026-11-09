// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { FieldSuggestion } from '../../../src/domain/autoprep';
import { createCompositeDetector } from '../../../src/features/autoprep/detectors';
import {
  generateLayoutPdf,
  LAYOUT_NAMES,
  layoutPdfPath,
  type LayoutPdf,
} from '../../fixtures/generateLayoutPdfs';
import { extract, pointsToNormalized, readBytes, referenceIou } from './support';

const detect = async (name: string) => createCompositeDetector().detect(await extract(readBytes(layoutPdfPath(name))));

function expectMatches(found: FieldSuggestion[], layout: LayoutPdf) {
  expect(found.map((s) => s.label).sort()).toEqual(layout.expected.map((e) => e.label).sort());
  const remaining = [...found];
  for (const item of layout.expected) {
    const size = layout.pages[item.page - 1];
    if (!size) throw new Error(`no page ${item.page}`);
    const area = pointsToNormalized(item, size);
    const at = remaining.findIndex(
      (s) => s.page === item.page && s.label === item.label && referenceIou(s.rect, area) >= 0.5,
    );
    expect(at, `${item.label} is not on page ${item.page} where it was drawn`).toBeGreaterThanOrEqual(0);
    const [match] = remaining.splice(at, 1) as [FieldSuggestion];
    expect({ type: match.type, auto: match.autoFillSigningDate }, item.label).toEqual({
      type: item.type,
      auto: item.autoFillSigningDate,
    });
  }
}

describe('committed layout PDFs', () => {
  it.each(LAYOUT_NAMES)('%s matches its generator', async (name) => {
    const { bytes } = await generateLayoutPdf(name);
    expect(Buffer.from(readBytes(layoutPdfPath(name))).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe('positions follow the displayed page', () => {
  it.each(['a4', 'us-legal', 'landscape', 'nonzero-mediabox', 'rotate-90-upright', 'wide-table', 'open-sided-rows', 'two-page'])(
    '%s',
    async (name) => expectMatches(await detect(name), await generateLayoutPdf(name)),
  );

  it('keeps every box on the page', async () => {
    for (const name of LAYOUT_NAMES) {
      for (const { rect } of await detect(name)) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(1);
        expect(rect.y + rect.h).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('pages with nothing to offer', () => {
  it('gives no boxes when rotation leaves the text on its side', async () => {
    const pages = await extract(readBytes(layoutPdfPath('rotate-90-sideways')));
    expect(pages[0]?.rules.length, 'rules must survive, so this tests the words').toBeGreaterThan(0);
    expect(pages[0]?.words, 'sideways text is not read as captions').toEqual([]);
    expect(createCompositeDetector().detect(pages)).toEqual([]);
  });

  it('does not crash and gives nothing on a page with no text layer', async () => {
    const pages = await extract(readBytes(layoutPdfPath('no-text-layer')));
    expect(pages[0]?.words).toEqual([]);
    expect(pages[0]?.rules.length).toBeGreaterThan(0);
    expect(createCompositeDetector().detect(pages)).toEqual([]);
  });

  it('does not close stacked signature lines into cells', async () => {
    expect(await detect('stacked-rules')).toEqual([]);
  });

  it('treats a short entry beside a paragraph as reference text', async () => {
    expect(await detect('reference-table')).toEqual([]);
  });
});

describe('signature block in a one-table form', () => {
  it('leaves other names and dates alone and fills only the signing date', async () => {
    const layout = await generateLayoutPdf('one-table');
    expectMatches(await detect('one-table'), layout);
  });
});

describe('labels', () => {
  it('drops a form line number and keeps the rest', async () => {
    const { formatLabel } = await import('../../../src/features/autoprep/classify/classify');
    expect(formatLabel('6 City, State, and ZIP code', false)).toBe('City, State, and ZIP Code');
    expect(formatLabel('7a Name of party', false)).toBe('Name of Party');
    expect(formatLabel('(a) First name', false)).toBe('First Name');
    expect(formatLabel('401 Plan', false)).toBe('401 Plan');
  });
});
