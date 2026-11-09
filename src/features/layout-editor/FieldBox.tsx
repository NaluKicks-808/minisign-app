import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  dragRect,
  isPastDragThreshold,
  resizeRect,
  toNormalized,
  type PointPx,
} from '../../domain/geometry';
import type { Field, NormalizedRect } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { useSetFieldPreview } from '../viewer/fieldPreview';
import { fieldTypeName } from './fieldDefaults';
import styles from './FieldBox.module.css';

interface Gesture {
  apply: typeof dragRect;
  startPx: PointPx;
  startOnPage: PointPx;
  startRect: NormalizedRect;
  latest: NormalizedRect | null;
}

/** Normalized against the page's live rect, so zoom and window width cannot skew a gesture. */
function pointOnPage(element: HTMLElement, event: PointerEvent): PointPx {
  const page = element.closest('[data-testid^="page-surface-"]');
  return toNormalized({ x: event.clientX, y: event.clientY }, page!.getBoundingClientRect());
}

/** A placed field in Layout mode: drag the body to move, drag the corner to resize, click to select. */
export function FieldBox({ field }: { field: Field }) {
  const selected = useAppStore((s) => s.selectedFieldId === field.id);
  const selectField = useAppStore((s) => s.selectField);
  const selectSuggestion = useAppStore((s) => s.selectSuggestion);
  const updateField = useAppStore((s) => s.updateField);
  const setPreview = useSetFieldPreview();

  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const select = () => {
    selectField(field.id);
    selectSuggestion(null);
  };

  const begin = (event: PointerEvent, apply: Gesture['apply']) => {
    const root = rootRef.current;
    if (event.button !== 0 || !root) return;
    event.stopPropagation();
    select();
    root.setPointerCapture(event.pointerId);
    gesture.current = {
      apply,
      startPx: { x: event.clientX, y: event.clientY },
      startOnPage: pointOnPage(root, event),
      startRect: field.rect,
      latest: null,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const moved = isPastDragThreshold(current.startPx, { x: event.clientX, y: event.clientY });
    if (!current.latest && !moved) return;
    const to = pointOnPage(event.currentTarget, event);
    current.latest = current.apply(current.startRect, current.startOnPage, to);
    setPreview({ id: field.id, rect: current.latest });
  };

  const commit = async (rect: NormalizedRect) => {
    try {
      await updateField(field.id, { rect });
    } finally {
      // Cleared only after the store has re-read, or the box would blink back to its old spot.
      setPreview(null);
    }
  };

  const onPointerUp = () => {
    const rect = gesture.current?.latest;
    gesture.current = null;
    if (rect) void commit(rect);
  };

  const onPointerCancel = () => {
    gesture.current = null;
    setPreview(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  };

  return (
    <div
      ref={rootRef}
      className={styles.box}
      role="button"
      tabIndex={0}
      aria-label={`${fieldTypeName(field.type)}: ${field.label}, ${field.assignee}`}
      aria-pressed={selected}
      data-selected={selected}
      onPointerDown={(event) => begin(event, dragRect)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <span className={styles.typeName}>{fieldTypeName(field.type)}</span>
      <span
        className={styles.handle}
        data-testid="field-resize-handle"
        onPointerDown={(event) => begin(event, resizeRect)}
      />
    </div>
  );
}
