/** Contract (PRD §4): the only module that does coordinate arithmetic. */
import type { CSSProperties } from 'react';
import type { NormalizedRect } from './types';

export interface PointPx {
  x: number;
  y: number;
}
export interface PageRectPx {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface PageSizePt {
  widthPt: number;
  heightPt: number;
}
/** In PDF points, measured from the page's top-left corner like NormalizedRect (PRD §10.3). */
export interface RectPt {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_FIELD_W = 0.02;
export const MIN_FIELD_H = 0.012;

/** Pointer travel below this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

const between = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export function toNormalized(pointerPx: PointPx, pageRectPx: PageRectPx): PointPx {
  return {
    x: (pointerPx.x - pageRectPx.left) / pageRectPx.width,
    y: (pointerPx.y - pageRectPx.top) / pageRectPx.height,
  };
}
export function fromPdfPoints(rectPt: RectPt, pageSizePt: PageSizePt): NormalizedRect {
  return {
    x: rectPt.x / pageSizePt.widthPt,
    y: rectPt.y / pageSizePt.heightPt,
    w: rectPt.w / pageSizePt.widthPt,
    h: rectPt.h / pageSizePt.heightPt,
  };
}
export function toPdfPoints(rect: NormalizedRect, pageSizePt: PageSizePt): RectPt {
  return {
    x: rect.x * pageSizePt.widthPt,
    y: rect.y * pageSizePt.heightPt,
    w: rect.w * pageSizePt.widthPt,
    h: rect.h * pageSizePt.heightPt,
  };
}
/**
 * Keeps the rect inside the page and at least the minimum size. A rect past an edge is slid back
 * rather than shrunk, so a box dragged against the edge keeps its size.
 */
export function clampRect(rect: NormalizedRect): NormalizedRect {
  const w = between(rect.w, MIN_FIELD_W, 1);
  const h = between(rect.h, MIN_FIELD_H, 1);
  const x = between(rect.x, 0, 1 - w);
  const y = between(rect.y, 0, 1 - h);
  // 1 - w can round up by one bit; give that back to the size so x + w never exceeds 1.
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}
/** Percent left/top/width/height for an absolutely positioned box. */
export function rectToStyle(rect: NormalizedRect): CSSProperties {
  return {
    position: 'absolute',
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
}
/** Intersection over union, used to de-duplicate suggestions. */
export function iou(a: NormalizedRect, b: NormalizedRect): number {
  const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapW <= 0 || overlapH <= 0) return 0;
  const overlap = overlapW * overlapH;
  return overlap / (a.w * a.h + b.w * b.h - overlap);
}

/** A box of the given size centred on a point, kept on the page. */
export function rectCenteredAt(point: PointPx, w: number, h: number): NormalizedRect {
  return clampRect({ x: point.x - w / 2, y: point.y - h / 2, w, h });
}
/** Shifts a rect by a normalized offset, kept on the page. */
export function nudgeRect(rect: NormalizedRect, dx: number, dy: number): NormalizedRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy });
}
/** Where a rect lands when the pointer has travelled from one normalized point to another. */
export function dragRect(start: NormalizedRect, from: PointPx, to: PointPx): NormalizedRect {
  return nudgeRect(start, to.x - from.x, to.y - from.y);
}
/** Bottom-right corner resize. The top-left stays put; the size stops at the page edge. */
export function resizeRect(start: NormalizedRect, from: PointPx, to: PointPx): NormalizedRect {
  return clampRect({
    ...start,
    w: Math.min(start.w + to.x - from.x, 1 - start.x),
    h: Math.min(start.h + to.y - from.y, 1 - start.y),
  });
}
export function isPastDragThreshold(from: PointPx, to: PointPx): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD_PX;
}
