/** Unruled "Label: ________" layouts: a caption ending in a colon, then room to write. */
import type { FieldDetector, FieldSuggestion, PageContent } from '../../../domain/autoprep';
import { classify, type FieldCandidate } from '../classify/classify';
import {
  averageCharWidth,
  centerInside,
  findCells,
  groupLines,
  isBlank,
  lineText,
  type Line,
  type Word,
} from './layout';

const HEIGHT_LINES = 1.4;
const MAX_LABEL_WORDS = 6;
/** With nothing drawn after it, a caption has to look like one rather than like prose. */
const MAX_BARE_LABEL_WORDS = 4;
const MIN_SPAN_WIDTH = 0.05;
const MIN_SPAN_CHARS = 6;
/** Consecutive lines of a paragraph sit within this many text heights of each other. */
const PARAGRAPH_LEADING = 1.8;
/** A wider line than this many words just above a bare caption means it continues a paragraph. */
const PARAGRAPH_LINE_WORDS = 6;

type Rule = PageContent['rules'][number];

const rightOf = (word: Word) => word.rect.x + word.rect.w;

function labelStart(words: Word[], colonAt: number, charWidth: number): number {
  let start = colonAt;
  while (start > 0) {
    const previous = words[start - 1];
    const current = words[start];
    if (!previous || !current || isBlank(previous) || previous.text.endsWith(':')) break;
    if (current.rect.x - rightOf(previous) > charWidth * 3) break;
    start -= 1;
  }
  return start;
}

/** The horizontal rule just under a span, if one is drawn there. */
function underline(
  rules: Rule[],
  baseline: number,
  height: number,
  from: number,
  to: number,
): Rule | null {
  let best: Rule | null = null;
  let bestOverlap = 0;
  for (const rule of rules) {
    if (rule.y2 - rule.y1 > 0.003 || Math.abs((rule.y1 + rule.y2) / 2 - baseline) > height * 0.6) continue;
    const overlap = Math.min(rule.x2, to) - Math.max(rule.x1, from);
    if (overlap > bestOverlap && overlap >= (rule.x2 - rule.x1) * 0.5) {
      best = rule;
      bestOverlap = overlap;
    }
  }
  return best;
}

function isBareCaption(label: Word[], line: Line, lines: Line[]): boolean {
  const text = lineText(label);
  if (label.length > MAX_BARE_LABEL_WORDS || !/^[A-Z]/.test(text)) return false;
  const at = lines.indexOf(line);
  const height = line.bottom - line.top;
  const previous = lines[at - 1];
  if (
    previous &&
    line.top - previous.top <= height * PARAGRAPH_LEADING &&
    previous.words.length > PARAGRAPH_LINE_WORDS
  ) {
    return false;
  }
  const next = lines[at + 1];
  const nextIsLabel = next?.words.some((word) => word.text.endsWith(':')) ?? false;
  return !(next && next.top - line.top <= height * PARAGRAPH_LEADING && !nextIsLabel);
}

function candidatesOnLine(
  line: Line,
  lines: Line[],
  page: PageContent,
  textRight: number,
  detector: string,
): FieldCandidate[] {
  const { words } = line;
  const charWidth = averageCharWidth(words.filter((word) => !isBlank(word)));
  const candidates: FieldCandidate[] = [];

  words.forEach((word, colonAt) => {
    if (isBlank(word) || !word.text.endsWith(':') || word.text.length < 2) return;
    const start = labelStart(words, colonAt, charWidth);
    const label = words.slice(start, colonAt + 1);
    if (label.length > MAX_LABEL_WORDS) return;

    let after = colonAt + 1;
    while (words[after] && isBlank(words[after] as Word)) after += 1;
    const blanks = words.slice(colonAt + 1, after);
    const nextWord = words[after];
    const lastBlank = blanks[blanks.length - 1];

    const spanStart = rightOf(word) + charWidth;
    let spanEnd = textRight;
    if (lastBlank) spanEnd = rightOf(lastBlank);
    else if (nextWord) spanEnd = nextWord.rect.x - charWidth;

    const bottom = line.bottom;
    const height = bottom - line.top;
    // With nothing after the label the span is open, so the rule alone says where it stops.
    const searchEnd = lastBlank || nextWord ? spanEnd : 1;
    const rule = underline(page.rules, bottom, height, spanStart, searchEnd);
    const x0 = rule ? Math.max(rule.x1, spanStart) : spanStart;
    const x1 = rule ? (nextWord ? Math.min(rule.x2, spanEnd) : rule.x2) : spanEnd;

    if (x1 - x0 < Math.max(MIN_SPAN_WIDTH, charWidth * MIN_SPAN_CHARS)) return;
    if (!rule && !lastBlank && (nextWord || !isBareCaption(label, line, lines))) return;

    const fieldBottom = rule ? (rule.y1 + rule.y2) / 2 : bottom;
    const fieldHeight = height * HEIGHT_LINES;
    const y = Math.max(0, fieldBottom - fieldHeight);
    const first = label[0] ?? word;
    const text = lineText(label);
    let found = 'an empty span';
    let confidence = 0.45;
    if (rule) {
      found = 'an underline rule';
      confidence = 0.85;
    } else if (lastBlank) {
      found = 'typed underscores';
      confidence = 0.8;
    }
    candidates.push({
      page: page.page,
      rect: { x: x0, y, w: x1 - x0, h: fieldBottom - y },
      caption: text,
      captionRect: { x: first.rect.x, y: line.top, w: rightOf(word) - first.rect.x, h: height },
      tableId: null,
      confidence,
      detector,
      evidence: `label "${text}" followed by ${found}`,
    });
  });
  return candidates;
}

export const LabelGapDetector: FieldDetector = {
  name: 'label-gap',
  detect(pages: PageContent[]): FieldSuggestion[] {
    return pages.flatMap((page) => {
      const cells = findCells(page);
      const loose = page.words.filter(
        (word) => !cells.some((cell) => centerInside(word.rect, cell.rect)),
      );
      const lines = groupLines(loose);
      const textRight = Math.max(0, ...page.words.map(rightOf));
      const candidates = lines.flatMap((line) =>
        candidatesOnLine(line, lines, page, textRight, LabelGapDetector.name),
      );
      return classify(candidates, page, cells);
    });
  },
};
