/**
 * The only extraction code that touches pdf.js (PRD §10.2). Everything leaves here as a
 * PageContent in 0..1 page space, so detectors never see PDF coordinates or pdf.js types.
 */
import { getDocument, GlobalWorkerOptions, OPS } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageContent, PageContentExtractor } from '../../../domain/autoprep';
import type { SourceDocument } from '../../../domain/types';

type Matrix = [number, number, number, number, number, number];
type Viewport = ReturnType<PDFPageProxy['getViewport']>;
type Word = PageContent['words'][number];
type Rule = PageContent['rules'][number];
type Rect = PageContent['shadedRects'][number];

interface Point {
  x: number;
  y: number;
}
interface SubPath {
  points: Point[];
  closed: boolean;
  curved: boolean;
}
interface GraphicsState {
  ctm: Matrix;
  fill: string | null;
  stroke: string | null;
}

export interface PdfInfo {
  pageCount: number;
  pageSizes: { widthPt: number; heightPt: number }[];
}

/** How pdf.js encodes a path in constructPath: a flat list of an opcode then its coordinates. */
const PATH_OP = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

const STROKING = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);
const FILLING = new Set<number>([
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);
const CLOSING = new Set<number>([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

/** Axis tolerance, in points, for calling a segment horizontal or vertical. */
const AXIS_TOLERANCE_PT = 0.25;
/** Shorter strokes are tick marks and glyph-like decoration, not table lines. */
const MIN_RULE_LENGTH_PT = 2;
/** Many producers draw table lines as thin filled rectangles rather than strokes. */
const MAX_FILLED_RULE_THICKNESS_PT = 1.5;
/** Near-white paint does not show on paper, so it cannot be a rule or a header band. */
const MAX_VISIBLE_LUMA = 0.96;
/** A fill this large is a page background, not a header band. */
const MAX_SHADED_PAGE_FRACTION = 0.8;
/** Share of the font size above the baseline; the rest is the descender. */
const ASCENT = 0.8;

/** Applies n first, then m. */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** pdf.js reports every color space as an RGB hex string by the time it reaches the list. */
function isVisible(color: string | null): boolean {
  if (color === null) return true;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return true;
  const [r, g, b] = [match[1], match[2], match[3]].map((h) => parseInt(h ?? '0', 16) / 255);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) < MAX_VISIBLE_LUMA;
}

/** Rough relative glyph widths: pdf.js gives one width per text run, not per character. */
function charWeight(ch: string): number {
  if (' .,:;\'’!|ijlIft()[]'.includes(ch)) return 0.3;
  if ('mwMW'.includes(ch)) return 0.85;
  if (ch === '_') return 0.56;
  return ch >= 'A' && ch <= 'Z' ? 0.68 : 0.52;
}

function weightOf(text: string): number {
  let total = 0;
  for (const ch of text) total += charWeight(ch);
  return total;
}

/** Splits a text run on whitespace, and keeps a run of underscores apart from its label. */
const TOKEN = /_{2,}|(?:[^\s_]|_(?!_))+/g;

function extractWords(items: TextItem[], viewport: Viewport): Word[] {
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const words: Word[] = [];
  for (const item of items) {
    if (!item.str.trim() || item.width <= 0) continue;
    const m = multiply(viewport.transform as Matrix, item.transform as Matrix);
    // Rotated text is a watermark or margin note, never a form caption.
    if (m[0] <= 0 || Math.abs(m[1]) > Math.abs(m[0]) * 0.01) continue;
    const fontSize = Math.hypot(m[2], m[3]);
    const total = weightOf(item.str);
    const top = m[5] - fontSize * ASCENT;
    for (const token of item.str.matchAll(TOKEN)) {
      const before = weightOf(item.str.slice(0, token.index));
      const x = m[4] + (item.width * before) / total;
      const w = (item.width * weightOf(token[0])) / total;
      words.push({
        text: token[0],
        fontSize,
        rect: {
          x: x / pageWidth,
          y: top / pageHeight,
          w: w / pageWidth,
          h: fontSize / pageHeight,
        },
      });
    }
  }
  return words;
}

function parsePath(data: ArrayLike<number>, ctm: Matrix): SubPath[] {
  const subPaths: SubPath[] = [];
  let current: SubPath | null = null;
  const at = (i: number) => data[i] ?? 0;
  for (let i = 0; i < data.length; ) {
    switch (data[i]) {
      case PATH_OP.moveTo:
        current = { points: [apply(ctm, at(i + 1), at(i + 2))], closed: false, curved: false };
        subPaths.push(current);
        i += 3;
        break;
      case PATH_OP.lineTo:
        current?.points.push(apply(ctm, at(i + 1), at(i + 2)));
        i += 3;
        break;
      case PATH_OP.curveTo:
        if (current) current.curved = true;
        i += 7;
        break;
      case PATH_OP.quadraticCurveTo:
        if (current) current.curved = true;
        i += 5;
        break;
      case PATH_OP.closePath:
        if (current) current.closed = true;
        i += 1;
        break;
      default:
        throw new Error(`Unknown path opcode ${String(data[i])} from pdf.js`);
    }
  }
  return subPaths;
}

function boxOf(path: SubPath): { x0: number; y0: number; x1: number; y1: number } | null {
  if (path.curved) return null;
  const points = [...path.points];
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length === 5 && first.x === last.x && first.y === last.y) points.pop();
  if (points.length !== 4) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const box = {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
  const onCorner = points.every(
    (p) =>
      (Math.abs(p.x - box.x0) <= AXIS_TOLERANCE_PT || Math.abs(p.x - box.x1) <= AXIS_TOLERANCE_PT) &&
      (Math.abs(p.y - box.y0) <= AXIS_TOLERANCE_PT || Math.abs(p.y - box.y1) <= AXIS_TOLERANCE_PT),
  );
  return onCorner ? box : null;
}

function extractGraphics(
  fnArray: number[],
  argsArray: unknown[],
  viewport: Viewport,
): { rules: Rule[]; shadedRects: Rect[] } {
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const rules: Rule[] = [];
  const shadedRects: Rect[] = [];
  const addRule = (a: Point, b: Point) => {
    const horizontal = Math.abs(a.y - b.y) <= AXIS_TOLERANCE_PT;
    const vertical = Math.abs(a.x - b.x) <= AXIS_TOLERANCE_PT;
    if (horizontal === vertical) return;
    if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_RULE_LENGTH_PT) return;
    rules.push({
      x1: Math.min(a.x, b.x) / pageWidth,
      y1: Math.min(a.y, b.y) / pageHeight,
      x2: Math.max(a.x, b.x) / pageWidth,
      y2: Math.max(a.y, b.y) / pageHeight,
    });
  };

  let state: GraphicsState = {
    ctm: [...viewport.transform] as Matrix,
    fill: null,
    stroke: null,
  };
  const stack: GraphicsState[] = [];

  fnArray.forEach((fn, index) => {
    const args = argsArray[index] as unknown[] | null;
    switch (fn) {
      case OPS.save:
        stack.push({ ...state });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state = { ...state, ctm: multiply(state.ctm, args as unknown as Matrix) };
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...state });
        const matrix = args?.[0] as Matrix | null | undefined;
        if (matrix) state = { ...state, ctm: multiply(state.ctm, matrix) };
        break;
      }
      case OPS.paintFormXObjectEnd:
        state = stack.pop() ?? state;
        break;
      case OPS.setFillRGBColor:
        state = { ...state, fill: args?.[0] as string };
        break;
      case OPS.setStrokeRGBColor:
        state = { ...state, stroke: args?.[0] as string };
        break;
      case OPS.constructPath: {
        // Encoded as [paintOp, [flat path or null], minMax] in this pdf.js version.
        const paintOp = args?.[0] as number;
        const data = (args?.[1] as (ArrayLike<number> | null)[] | undefined)?.[0];
        if (!data) break;
        const subPaths = parsePath(data, state.ctm);
        if (STROKING.has(paintOp) && isVisible(state.stroke)) {
          for (const path of subPaths) {
            if (path.curved) continue;
            path.points.forEach((point, i) => {
              const next = path.points[i + 1];
              if (next) addRule(point, next);
            });
            const first = path.points[0];
            const last = path.points[path.points.length - 1];
            if ((path.closed || CLOSING.has(paintOp)) && first && last) addRule(last, first);
          }
        }
        if (FILLING.has(paintOp) && isVisible(state.fill)) {
          for (const path of subPaths) {
            const box = boxOf(path);
            if (!box) continue;
            const w = box.x1 - box.x0;
            const h = box.y1 - box.y0;
            if (h <= MAX_FILLED_RULE_THICKNESS_PT) {
              const y = (box.y0 + box.y1) / 2;
              addRule({ x: box.x0, y }, { x: box.x1, y });
            } else if (w <= MAX_FILLED_RULE_THICKNESS_PT) {
              const x = (box.x0 + box.x1) / 2;
              addRule({ x, y: box.y0 }, { x, y: box.y1 });
            } else if (w * h < pageWidth * pageHeight * MAX_SHADED_PAGE_FRACTION) {
              shadedRects.push({
                x: box.x0 / pageWidth,
                y: box.y0 / pageHeight,
                w: w / pageWidth,
                h: h / pageHeight,
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  });
  return { rules, shadedRects };
}

/** The core: testable in Node, because it takes an already opened document. */
export async function extractFromPdf(pdf: PDFDocumentProxy): Promise<PageContent[]> {
  const pages: PageContent[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    // Scale 1 keeps points, and the viewport applies crop box and page rotation.
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    const items = text.items.filter((item): item is TextItem => 'str' in item);
    const ops = await page.getOperatorList();
    pages.push({
      page: n,
      words: extractWords(items, viewport),
      ...extractGraphics(ops.fnArray, ops.argsArray, viewport),
    });
  }
  return pages;
}

export async function readPageInfo(pdf: PDFDocumentProxy): Promise<PdfInfo> {
  const pageSizes: PdfInfo['pageSizes'] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    pageSizes.push({ widthPt: width, heightPt: height });
  }
  return { pageCount: pdf.numPages, pageSizes };
}

async function withPdf<T>(
  data: Uint8Array,
  read: (pdf: PDFDocumentProxy) => Promise<T>,
): Promise<T> {
  GlobalWorkerOptions.workerSrc ||= workerUrl;
  const task = getDocument({ data });
  try {
    return await read(await task.promise);
  } finally {
    await task.destroy();
  }
}

/** Page count and sizes for an upload. */
export function readPdfInfo(data: Uint8Array): Promise<PdfInfo> {
  return withPdf(data, readPageInfo);
}

/** Browser extractor: fileUrl is a static path or, for uploads, a data: URL. */
export const pdfjsPageContentExtractor: PageContentExtractor = {
  async extract(source: SourceDocument) {
    const response = await fetch(source.fileUrl);
    if (!response.ok) throw new Error(`Could not load ${source.title}.`);
    return withPdf(new Uint8Array(await response.arrayBuffer()), extractFromPdf);
  },
};
