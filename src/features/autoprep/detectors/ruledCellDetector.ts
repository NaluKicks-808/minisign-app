/** Fields written inside drawn table cells, under a small caption in the cell's top-left. */
import type { FieldDetector, FieldSuggestion, PageContent } from '../../../domain/autoprep';
import type { NormalizedRect } from '../../../domain/types';
import { classify, type FieldCandidate } from '../classify/classify';
import { findCells, groupLines, isBlank, lineText, wordsInside, type Cell, type Word } from './layout';

const CELL_INSET = 0.015;
const MAX_CAPTION_WORDS = 6;
/** The caption must start within this share of the cell, measured from its top-left. */
const CAPTION_MAX_OFFSET_X = 0.15;
const CAPTION_MAX_OFFSET_Y = 0.4;
/** A neighbouring cell holding this many words is a paragraph, not a caption. */
const PROSE_WORDS = 20;

function shadedShare(cell: NormalizedRect, shaded: NormalizedRect[]): number {
  let covered = 0;
  for (const band of shaded) {
    const w = Math.min(cell.x + cell.w, band.x + band.w) - Math.max(cell.x, band.x);
    const h = Math.min(cell.y + cell.h, band.y + band.h) - Math.max(cell.y, band.y);
    if (w > 0 && h > 0) covered += w * h;
  }
  return covered / (cell.w * cell.h);
}

/** A row with a paragraph in it is a reference table: its short cells are entries, not fields. */
function besideProse(cell: Cell, page: PageContent, cells: Cell[]): boolean {
  const middle = cell.rect.y + cell.rect.h / 2;
  return cells.some(
    (other) =>
      other !== cell &&
      other.tableId === cell.tableId &&
      other.rect.y <= middle &&
      middle <= other.rect.y + other.rect.h &&
      wordsInside(page.words, other.rect).length >= PROSE_WORDS,
  );
}

/** "Home address. If you have a P.O. box, see instructions." is captioned by its first sentence. */
function firstSentence(words: Word[]): Word[] {
  const end = words.findIndex(
    (word, i) => word.text.length > 4 && word.text.endsWith('.') && /^[A-Z]/.test(words[i + 1]?.text ?? ''),
  );
  if (end < 0) return words;
  const kept = words.slice(0, end + 1);
  const last = kept[kept.length - 1] as Word;
  return [...kept.slice(0, -1), { ...last, text: last.text.slice(0, -1) }];
}

/** The caption's words, or null when the cell holds anything but one blank-field caption. */
function captionOf(cell: Cell, page: PageContent, cells: Cell[]): Word[] | null {
  if (shadedShare(cell.rect, page.shadedRects) >= 0.5) return null;
  if (besideProse(cell, page, cells)) return null;
  const lines = groupLines(wordsInside(page.words, cell.rect).filter((word) => !isBlank(word)));
  const line = lines[0];
  if (lines.length !== 1 || !line) return null;
  const words = firstSentence(line.words);
  const first = words[0];
  const text = lineText(words);
  if (!first || words.length > MAX_CAPTION_WORDS || /[.;?!]$/.test(text) || /^[•·∙*–]/.test(text)) {
    return null;
  }
  if (words.slice(0, -1).some((word) => word.text.endsWith(':'))) return null;
  if (first.rect.x - cell.rect.x > cell.rect.w * CAPTION_MAX_OFFSET_X) return null;
  if (line.top - cell.rect.y > cell.rect.h * CAPTION_MAX_OFFSET_Y) return null;
  const spaceBelow = cell.rect.y + cell.rect.h - line.bottom;
  return spaceBelow >= first.rect.h ? words : null;
}

function candidateFor(cell: Cell, caption: Word[], page: number, detector: string): FieldCandidate {
  const text = lineText(caption);
  const left = Math.min(...caption.map((word) => word.rect.x));
  const right = Math.max(...caption.map((word) => word.rect.x + word.rect.w));
  const top = Math.min(...caption.map((word) => word.rect.y));
  const bottom = Math.max(...caption.map((word) => word.rect.y + word.rect.h));
  const insetX = cell.rect.w * CELL_INSET;
  const insetY = cell.rect.h * CELL_INSET;
  const y = bottom + insetY;
  return {
    page,
    rect: {
      x: cell.rect.x + insetX,
      y,
      w: cell.rect.w - insetX * 2,
      h: cell.rect.y + cell.rect.h - insetY - y,
    },
    caption: text,
    captionRect: { x: left, y: top, w: right - left, h: bottom - top },
    tableId: cell.tableId,
    row: cell.row,
    confidence: text.endsWith(':') ? 0.9 : 0.75,
    detector,
    evidence: `label "${text}" in ruled cell r${cell.row}c${cell.col}`,
  };
}

export const RuledCellDetector: FieldDetector = {
  name: 'ruled-cell',
  detect(pages: PageContent[]): FieldSuggestion[] {
    return pages.flatMap((page) => {
      const cells = findCells(page);
      const candidates = cells.flatMap((cell) => {
        const caption = captionOf(cell, page, cells);
        return caption ? [candidateFor(cell, caption, page.page, RuledCellDetector.name)] : [];
      });
      return classify(candidates, page, cells);
    });
  },
};
