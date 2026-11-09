/** Contract (PRD §4): the only module that does coordinate arithmetic. Lane B implements. */
import type { CSSProperties } from 'react';
import { NotImplemented } from './errors';
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
export interface RectPt {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_FIELD_W = 0.02;
export const MIN_FIELD_H = 0.012;

export function toNormalized(_pointerPx: PointPx, _pageRectPx: PageRectPx): PointPx {
  throw new NotImplemented('toNormalized');
}
export function fromPdfPoints(_rectPt: RectPt, _pageSizePt: PageSizePt): NormalizedRect {
  throw new NotImplemented('fromPdfPoints');
}
export function toPdfPoints(_rect: NormalizedRect, _pageSizePt: PageSizePt): RectPt {
  throw new NotImplemented('toPdfPoints');
}
/** Keeps the rect inside the page and at least the minimum size. */
export function clampRect(_rect: NormalizedRect): NormalizedRect {
  throw new NotImplemented('clampRect');
}
/** Percent left/top/width/height for an absolutely positioned box. */
export function rectToStyle(_rect: NormalizedRect): CSSProperties {
  throw new NotImplemented('rectToStyle');
}
/** Intersection over union, used to de-duplicate suggestions. */
export function iou(_a: NormalizedRect, _b: NormalizedRect): number {
  throw new NotImplemented('iou');
}
