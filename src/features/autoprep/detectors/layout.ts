/** Pure page-layout analysis shared by detectors and classifiers. Input is PageContent only. */
import type { PageContent } from '../../../domain/autoprep';
import type { NormalizedRect } from '../../../domain/types';

export type Word = PageContent['words'][number];

export interface Cell {
  rect: NormalizedRect;
  tableId: number;
  row: number;
  col: number;
  firstRow: boolean;
}

export interface Line {
  words: Word[];
  top: number;
  bottom: number;
}

type Span = [number, number];

/** Two ruled positions closer than this (about 1.5 pt on a letter page) are the same line. */
const POSITION_TOLERANCE = 0.0025;
const MIN_CELL_W = 0.03;
const MIN_CELL_H = 0.012;
/** A gap wider than this many average characters separates two columns on one baseline. */
const COLUMN_GAP_CHARS = 3;

export const isBlank = (word: Word) => /^_{2,}$/.test(word.text);

export function centerInside(inner: NormalizedRect, outer: NormalizedRect): boolean {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

export function wordsInside(words: Word[], rect: NormalizedRect): Word[] {
  return words.filter((word) => centerInside(word.rect, rect));
}

export function lineText(line: Line | Word[]): string {
  const words = Array.isArray(line) ? line : line.words;
  return words.map((word) => word.text).join(' ');
}

/** Groups words into baselines, top to bottom, each sorted left to right. */
export function groupLines(words: Word[]): Line[] {
  const sorted = [...words].sort((a, b) => a.rect.y + a.rect.h - (b.rect.y + b.rect.h));
  const lines: Line[] = [];
  for (const word of sorted) {
    const bottom = word.rect.y + word.rect.h;
    const line = lines[lines.length - 1];
    if (line && bottom - line.bottom <= word.rect.h * 0.3) {
      line.words.push(word);
      line.top = Math.min(line.top, word.rect.y);
    } else {
      lines.push({ words: [word], top: word.rect.y, bottom });
    }
  }
  for (const line of lines) line.words.sort((a, b) => a.rect.x - b.rect.x);
  return lines;
}

export function averageCharWidth(words: Word[]): number {
  const chars = words.reduce((sum, word) => sum + word.text.length, 0);
  const width = words.reduce((sum, word) => sum + word.rect.w, 0);
  return chars > 0 ? width / chars : 0;
}

/** Cuts a baseline into runs of words wherever a column-sized gap opens up. */
export function splitSegments(line: Line): Word[][] {
  const limit = averageCharWidth(line.words) * COLUMN_GAP_CHARS;
  const segments: Word[][] = [];
  let previous: Word | undefined;
  for (const word of line.words) {
    const gap = previous ? word.rect.x - (previous.rect.x + previous.rect.w) : 0;
    if (!previous || gap > limit) segments.push([word]);
    else segments[segments.length - 1]?.push(word);
    previous = word;
  }
  return segments;
}

function clusterPositions(values: number[]): number[] {
  const clusters: number[][] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const cluster = clusters[clusters.length - 1];
    const last = cluster?.[cluster.length - 1];
    if (cluster && last !== undefined && value - last <= POSITION_TOLERANCE) cluster.push(value);
    else clusters.push([value]);
  }
  return clusters.map((c) => c.reduce((sum, v) => sum + v, 0) / c.length);
}

function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + POSITION_TOLERANCE) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** Each ruled position with the stretches of it that are actually drawn. */
function ruledLines(segments: { at: number; span: Span }[]): { at: number; spans: Span[] }[] {
  return clusterPositions(segments.map((s) => s.at)).map((at) => ({
    at,
    spans: mergeSpans(
      segments.filter((s) => Math.abs(s.at - at) <= POSITION_TOLERANCE * 1.5).map((s) => s.span),
    ),
  }));
}

function covers(spans: Span[] | undefined, a: number, b: number): boolean {
  return (spans ?? []).some(
    ([from, to]) => from <= a + POSITION_TOLERANCE && to >= b - POSITION_TOLERANCE,
  );
}

const sameEnd = (a: number, b: number) => Math.abs(a - b) <= POSITION_TOLERANCE * 1.5;

/**
 * Government-style forms leave a table's outer edges undrawn: its rows are full-width rules with
 * only the inner column lines drawn. Where two successive rules end at the same place and a
 * column line runs between them, that end is the row's edge. The column line is the evidence
 * that this is a table, not a stack of signature lines with captions under them.
 */
function undrawnRowEdges(
  horizontal: { at: number; spans: Span[] }[],
  vertical: { at: number; spans: Span[] }[],
): { at: number; span: Span }[] {
  const edges: { at: number; span: Span }[] = [];
  horizontal.forEach((upper, j) => {
    for (const [left, right] of upper.spans) {
      const lower = horizontal
        .slice(j + 1)
        .flatMap((line) =>
          line.spans
            .filter(([a, b]) => a < right && b > left)
            .map((span) => ({ at: line.at, span })),
        )[0];
      if (!lower) continue;
      const hasColumnLine = vertical.some(
        (line) => line.at > left && line.at < right && covers(line.spans, upper.at, lower.at),
      );
      if (!hasColumnLine) continue;
      const span: Span = [upper.at, lower.at];
      if (sameEnd(left, lower.span[0])) edges.push({ at: left, span });
      if (sameEnd(right, lower.span[1])) edges.push({ at: right, span });
    }
  });
  return edges;
}

class DisjointSet {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root] ?? root;
    this.parent[i] = root;
    return root;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

/**
 * Finds the closed cells drawn by a page's rules. The rules' positions cut the page into a grid
 * of small boxes; boxes with no rule between them merge, so a spanning cell comes out whole.
 * A merged region that leaks past the grid, or is not rectangular, is not a cell.
 */
export function findCells(page: PageContent): Cell[] {
  const horizontal = ruledLines(
    page.rules
      .filter((r) => r.y2 - r.y1 <= POSITION_TOLERANCE && r.x2 > r.x1)
      .map((r) => ({ at: (r.y1 + r.y2) / 2, span: [r.x1, r.x2] as Span })),
  );
  const drawnVertical = page.rules
    .filter((r) => r.x2 - r.x1 <= POSITION_TOLERANCE && r.y2 > r.y1)
    .map((r) => ({ at: (r.x1 + r.x2) / 2, span: [r.y1, r.y2] as Span }));
  const vertical = ruledLines([
    ...drawnVertical,
    ...undrawnRowEdges(horizontal, ruledLines(drawnVertical)),
  ]);
  const cols = vertical.length - 1;
  const rows = horizontal.length - 1;
  if (cols < 1 || rows < 1) return [];

  const xs = vertical.map((line) => line.at);
  const ys = horizontal.map((line) => line.at);
  const edge = (values: number[], i: number) => values[i] ?? 0;
  const index = (i: number, j: number) => j * cols + i;
  const hasHorizontal = (j: number, i: number) =>
    covers(horizontal[j]?.spans, edge(xs, i), edge(xs, i + 1));
  const hasVertical = (i: number, j: number) =>
    covers(vertical[i]?.spans, edge(ys, j), edge(ys, j + 1));

  const regions = new DisjointSet(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (i + 1 < cols && !hasVertical(i + 1, j)) regions.union(index(i, j), index(i + 1, j));
      if (j + 1 < rows && !hasHorizontal(j + 1, i)) regions.union(index(i, j), index(i, j + 1));
    }
  }

  const leaking = new Set<number>();
  for (let j = 0; j < rows; j++) {
    if (!hasVertical(0, j)) leaking.add(regions.find(index(0, j)));
    if (!hasVertical(cols, j)) leaking.add(regions.find(index(cols - 1, j)));
  }
  for (let i = 0; i < cols; i++) {
    if (!hasHorizontal(0, i)) leaking.add(regions.find(index(i, 0)));
    if (!hasHorizontal(rows, i)) leaking.add(regions.find(index(i, rows - 1)));
  }

  const boxes = new Map<number, { i0: number; i1: number; j0: number; j1: number; count: number }>();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const root = regions.find(index(i, j));
      const box = boxes.get(root);
      if (box) {
        box.i0 = Math.min(box.i0, i);
        box.i1 = Math.max(box.i1, i);
        box.j0 = Math.min(box.j0, j);
        box.j1 = Math.max(box.j1, j);
        box.count += 1;
      } else {
        boxes.set(root, { i0: i, i1: i, j0: j, j1: j, count: 1 });
      }
    }
  }

  const found: { root: number; rect: NormalizedRect }[] = [];
  for (const [root, box] of boxes) {
    if (leaking.has(root)) continue;
    if (box.count !== (box.i1 - box.i0 + 1) * (box.j1 - box.j0 + 1)) continue;
    const rect = {
      x: edge(xs, box.i0),
      y: edge(ys, box.j0),
      w: edge(xs, box.i1 + 1) - edge(xs, box.i0),
      h: edge(ys, box.j1 + 1) - edge(ys, box.j0),
    };
    if (rect.w >= MIN_CELL_W && rect.h >= MIN_CELL_H) found.push({ root, rect });
  }

  // Cells that touch belong to one table.
  const tables = new DisjointSet(found.length);
  const positionOf = new Map(found.map((cell, i) => [cell.root, i]));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const here = positionOf.get(regions.find(index(i, j)));
      if (here === undefined) continue;
      const right = i + 1 < cols ? positionOf.get(regions.find(index(i + 1, j))) : undefined;
      const down = j + 1 < rows ? positionOf.get(regions.find(index(i, j + 1))) : undefined;
      if (right !== undefined) tables.union(here, right);
      if (down !== undefined) tables.union(here, down);
    }
  }

  const tops = new Map<number, number>();
  found.forEach((cell, i) => {
    const table = tables.find(i);
    tops.set(table, Math.min(tops.get(table) ?? 1, cell.rect.y));
  });
  const rowsOf = (table: number) =>
    clusterPositions(found.filter((_, i) => tables.find(i) === table).map((c) => c.rect.y));
  const colsOf = (table: number) =>
    clusterPositions(found.filter((_, i) => tables.find(i) === table).map((c) => c.rect.x));
  const rank = (positions: number[], value: number) =>
    positions.findIndex((p) => Math.abs(p - value) <= POSITION_TOLERANCE * 1.5) + 1;

  return found.map((cell, i) => {
    const table = tables.find(i);
    return {
      rect: cell.rect,
      tableId: table,
      row: rank(rowsOf(table), cell.rect.y),
      col: rank(colsOf(table), cell.rect.x),
      firstRow: Math.abs(cell.rect.y - (tops.get(table) ?? 0)) <= POSITION_TOLERANCE,
    };
  });
}
