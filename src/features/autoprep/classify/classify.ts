/** Pure, table-driven classifiers (PRD §10.2): type, assignee, required, label. */
import type { FieldSuggestion, PageContent } from '../../../domain/autoprep';
import type { Assignee, FieldType, NormalizedRect } from '../../../domain/types';
import {
  LABEL_KINDS,
  MINOR_WORDS,
  OPTIONAL_LABEL,
  RECIPIENT_HEADER,
  SIGNATURE_BLOCK_LABELS,
  type LabelKind,
} from './keywords';
import {
  centerInside,
  groupLines,
  isBlank,
  lineText,
  splitSegments,
  wordsInside,
  type Cell,
  type Line,
} from '../detectors/layout';

/** What a detector found, before anyone has guessed what it means. */
export interface FieldCandidate {
  page: number;
  rect: NormalizedRect;
  caption: string;
  captionRect: NormalizedRect;
  /** The ruled table holding the field, or null when it is unruled. */
  tableId: number | null;
  confidence: number;
  detector: string;
  evidence: string;
}

interface Header {
  text: string;
  x0: number;
  x1: number;
  bottom: number;
}

/** Unruled fields this many caption heights apart still count as one signature block. */
const SIGNATURE_BLOCK_LINES = 5;
const MAX_HEADING_WORDS = 5;
const SAME_HEADER_ROW = 0.004;

export function kindOf(caption: string): LabelKind {
  return LABEL_KINDS.find((entry) => entry.pattern.test(caption))?.kind ?? 'text';
}

export function isRequired(caption: string): boolean {
  return !OPTIONAL_LABEL.test(caption);
}

export function formatLabel(caption: string, inSignatureBlock: boolean): string {
  const bare = caption.replace(/\s*:\s*$/, '').trim();
  if (inSignatureBlock) {
    const short = SIGNATURE_BLOCK_LABELS.find((entry) => entry.pattern.test(bare));
    if (short) return short.label;
  }
  const source = bare === bare.toUpperCase() ? bare.toLowerCase() : bare;
  return source
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && MINOR_WORDS.has(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function sharesSignatureBlock(field: FieldCandidate, signature: FieldCandidate): boolean {
  if (field.page !== signature.page) return false;
  if (field.tableId !== null || signature.tableId !== null) return field.tableId === signature.tableId;
  const reach = field.captionRect.h * SIGNATURE_BLOCK_LINES;
  return Math.abs(field.captionRect.y - signature.captionRect.y) <= reach;
}

function isHeadingSegment(text: string): boolean {
  const words = text.split(/\s+/);
  return words.length <= MAX_HEADING_WORDS && !/[:.,;?!]$/.test(text) && !words.some((w) => w.endsWith(':'));
}

/** A header band can hold several column titles: each one owns the width up to the next. */
function headersFromLine(line: Line, x0: number, x1: number): Header[] {
  const segments = splitSegments(line);
  return segments.map((segment, i) => {
    const previous = segments[i - 1];
    const next = segments[i + 1];
    const first = segment[0];
    const last = segment[segment.length - 1];
    return {
      text: lineText(segment),
      x0: previous && first ? (rightOf(previous) + first.rect.x) / 2 : x0,
      x1: next && next[0] && last ? (last.rect.x + last.rect.w + next[0].rect.x) / 2 : x1,
      bottom: line.bottom,
    };
  });
}

function rightOf(segment: Line['words']): number {
  const last = segment[segment.length - 1];
  return last ? last.rect.x + last.rect.w : 0;
}

/** Shaded bands, the first row of each ruled table, and short heading lines. */
function findHeaders(page: PageContent, cells: Cell[], candidates: FieldCandidate[]): Header[] {
  const headers: Header[] = [];
  const isField = (cell: Cell) =>
    candidates.some((c) => c.tableId === cell.tableId && centerInside(c.rect, cell.rect));

  for (const cell of cells) {
    if (!cell.firstRow || isField(cell)) continue;
    const text = lineText(wordsInside(page.words, cell.rect));
    if (text) {
      headers.push({
        text,
        x0: cell.rect.x,
        x1: cell.rect.x + cell.rect.w,
        bottom: cell.rect.y + cell.rect.h,
      });
    }
  }

  for (const band of page.shadedRects) {
    if (cells.some((cell) => centerInside(band, cell.rect))) continue;
    for (const line of groupLines(wordsInside(page.words, band))) {
      for (const header of headersFromLine(line, band.x, band.x + band.w)) {
        headers.push({ ...header, bottom: band.y + band.h });
      }
    }
  }

  const loose = page.words.filter(
    (word) => !isBlank(word) && !cells.some((cell) => centerInside(word.rect, cell.rect)),
  );
  for (const line of groupLines(loose)) {
    const parts = splitSegments(line).map(lineText);
    if (parts.every(isHeadingSegment)) headers.push(...headersFromLine(line, 0, 1));
  }
  return headers;
}

function assigneeOf(
  field: FieldCandidate,
  headers: Header[],
  inSignatureBlock: boolean,
): Assignee {
  const centerX = field.rect.x + field.rect.w / 2;
  const nearest = headers
    .filter((h) => h.x0 <= centerX && centerX <= h.x1 && h.bottom <= field.captionRect.y + 0.002)
    .sort((a, b) => b.bottom - a.bottom)[0];
  if (!nearest || RECIPIENT_HEADER.test(nearest.text)) return 'recipient';
  const otherColumnIsRecipient = headers.some(
    (h) =>
      h !== nearest &&
      Math.abs(h.bottom - nearest.bottom) <= SAME_HEADER_ROW &&
      (h.x1 <= nearest.x0 + 0.002 || h.x0 >= nearest.x1 - 0.002) &&
      RECIPIENT_HEADER.test(h.text),
  );
  return inSignatureBlock && otherColumnIsRecipient ? 'sender' : 'recipient';
}

/** Classifies one page's candidates together, because a signature changes its neighbours. */
export function classify(
  candidates: FieldCandidate[],
  page: PageContent,
  cells: Cell[],
): FieldSuggestion[] {
  const signatures = candidates.filter((c) => kindOf(c.caption) === 'signature');
  const headers = findHeaders(page, cells, candidates);
  return candidates.map((candidate) => {
    const kind = kindOf(candidate.caption);
    const inBlock = signatures.some((s) => sharesSignatureBlock(candidate, s));
    let type: FieldType;
    if (kind === 'name') type = inBlock ? 'signerName' : 'text';
    else type = kind;
    return {
      page: candidate.page,
      rect: candidate.rect,
      label: formatLabel(candidate.caption, inBlock),
      type,
      assignee: assigneeOf(candidate, headers, inBlock),
      required: isRequired(candidate.caption),
      autoFillSigningDate: kind === 'date' && inBlock,
      confidence: candidate.confidence,
      detector: candidate.detector,
      evidence: candidate.evidence,
    };
  });
}
