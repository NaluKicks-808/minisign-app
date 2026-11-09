import { describe, expect, it } from 'vitest';
import {
  MIN_FIELD_H,
  MIN_FIELD_W,
  clampRect,
  dragRect,
  fromPdfPoints,
  iou,
  rectToStyle,
  resizeRect,
  toNormalized,
  toPdfPoints,
} from '../../../src/domain/geometry';

const LETTER = { widthPt: 612, heightPt: 792 };

describe('points and normalized space', () => {
  it('divides by the page size', () => {
    expect(fromPdfPoints({ x: 153, y: 198, w: 306, h: 396 }, LETTER)).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
  });

  it('round-trips points through normalized space', () => {
    const rectPt = { x: 71.3, y: 402.9, w: 188.25, h: 17.6 };
    const back = toPdfPoints(fromPdfPoints(rectPt, LETTER), LETTER);
    expect(back.x).toBeCloseTo(rectPt.x, 9);
    expect(back.y).toBeCloseTo(rectPt.y, 9);
    expect(back.w).toBeCloseTo(rectPt.w, 9);
    expect(back.h).toBeCloseTo(rectPt.h, 9);
  });
});

describe('clampRect', () => {
  const inside = (r: { x: number; y: number; w: number; h: number }) => {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  };

  it.each([
    ['past the top-left', { x: -0.4, y: -0.2, w: 0.3, h: 0.1 }],
    ['past the bottom-right', { x: 0.95, y: 0.99, w: 0.3, h: 0.1 }],
    ['larger than the page', { x: 0.5, y: 0.5, w: 3, h: 2 }],
    ['a value that rounds badly', { x: 0.9, y: 0.9, w: 0.1 + 0.2, h: 0.1 + 0.7 }],
  ])('keeps a rect %s inside the page', (_name, rect) => {
    inside(clampRect(rect));
  });

  it('slides a rect back instead of shrinking it', () => {
    const r = clampRect({ x: 0.9, y: 0.5, w: 0.3, h: 0.1 });
    expect(r.w).toBe(0.3);
    expect(r.x).toBeCloseTo(0.7, 12);
  });

  it('enforces the minimum size', () => {
    const r = clampRect({ x: 0.5, y: 0.5, w: 0.001, h: 0 });
    expect(r.w).toBe(MIN_FIELD_W);
    expect(r.h).toBe(MIN_FIELD_H);
  });

  it('leaves a rect that is already valid alone', () => {
    const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(clampRect(rect)).toEqual(rect);
  });
});

describe('toNormalized', () => {
  it('gives the same point at two container widths', () => {
    const narrow = { left: 40, top: 100, width: 600, height: 776.47 };
    const wide = { left: 250, top: 64, width: 900, height: 1164.705 };
    const fraction = { x: 0.37, y: 0.62 };
    const pointerAt = (page: typeof narrow) => ({
      x: page.left + page.width * fraction.x,
      y: page.top + page.height * fraction.y,
    });
    const a = toNormalized(pointerAt(narrow), narrow);
    const b = toNormalized(pointerAt(wide), wide);
    expect(a.x).toBeCloseTo(fraction.x, 9);
    expect(a.y).toBeCloseTo(fraction.y, 9);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
  });
});

describe('gestures', () => {
  const start = { x: 0.7, y: 0.5, w: 0.2, h: 0.05 };

  it('keeps the size when a drag runs into the edge', () => {
    const r = dragRect(start, { x: 0.8, y: 0.5 }, { x: 1.4, y: 0.5 });
    expect(r.w).toBeCloseTo(start.w, 12);
    expect(r.x + r.w).toBeCloseTo(1, 12);
  });

  it('stops a resize at the page edge without moving the origin', () => {
    const r = resizeRect(start, { x: 0.9, y: 0.55 }, { x: 1.5, y: 0.55 });
    expect(r.x).toBe(start.x);
    expect(r.x + r.w).toBeCloseTo(1, 12);
  });

  it('stops a resize at the minimum size', () => {
    const r = resizeRect(start, { x: 0.9, y: 0.55 }, { x: 0, y: 0 });
    expect(r).toEqual({ x: start.x, y: start.y, w: MIN_FIELD_W, h: MIN_FIELD_H });
  });
});

describe('rectToStyle', () => {
  it('uses percentages only', () => {
    expect(rectToStyle({ x: 0.25, y: 0.5, w: 0.125, h: 0.05 })).toEqual({
      position: 'absolute',
      left: '25%',
      top: '50%',
      width: '12.5%',
      height: '5%',
    });
  });
});

describe('iou', () => {
  const a = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };

  it('is 1 for identical rects', () => {
    expect(iou(a, a)).toBeCloseTo(1, 12);
  });

  it('is 0 for rects that touch or sit apart', () => {
    expect(iou(a, { x: 0.3, y: 0.1, w: 0.2, h: 0.2 })).toBeCloseTo(0, 12);
    expect(iou(a, { x: 0.5, y: 0.5, w: 0.2, h: 0.2 })).toBe(0);
  });

  it('is the overlap over the union for a half offset', () => {
    // Overlap is half of each rect, so the union is 1.5 rects and IoU is 1/3.
    expect(iou(a, { x: 0.2, y: 0.1, w: 0.2, h: 0.2 })).toBeCloseTo(1 / 3, 9);
  });
});
