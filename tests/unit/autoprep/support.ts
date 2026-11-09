/** Shared by the auto-prep tests. Not a suite. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageContent } from '../../../src/domain/autoprep';
import type { NormalizedRect } from '../../../src/domain/types';
import { extractFromPdf } from '../../../src/features/autoprep/pageContent/pdfjsPageContent';

export const SAMPLE_PATH = fileURLToPath(
  new URL('../../../public/sample/master-agreement.pdf', import.meta.url),
);

export const readBytes = (path: string) => new Uint8Array(readFileSync(path));

export async function extract(bytes: Uint8Array): Promise<PageContent[]> {
  // pdf.js takes ownership of the buffer, so hand it a copy.
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  try {
    return await extractFromPdf(pdf as unknown as PDFDocumentProxy);
  } finally {
    await task.destroy();
  }
}

/** Independent of src/domain/geometry so a wrong iou there cannot pass its own check. */
export function referenceIou(a: NormalizedRect, b: NormalizedRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const shared = w * h;
  return shared / (a.w * a.h + b.w * b.h - shared);
}

export function pointsToNormalized(
  box: { x0: number; x1: number; y0: number; y1: number },
  size: { widthPt: number; heightPt: number },
): NormalizedRect {
  return {
    x: box.x0 / size.widthPt,
    y: box.y0 / size.heightPt,
    w: (box.x1 - box.x0) / size.widthPt,
    h: (box.y1 - box.y0) / size.heightPt,
  };
}
