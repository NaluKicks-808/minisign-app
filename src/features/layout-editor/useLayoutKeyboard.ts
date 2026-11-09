import { useEffect } from 'react';
import { nudgeRect } from '../../domain/geometry';
import type { FieldId } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';

const NUDGE = 0.005;
const NUDGES: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -NUDGE, dy: 0 },
  ArrowRight: { dx: NUDGE, dy: 0 },
  ArrowUp: { dx: 0, dy: -NUDGE },
  ArrowDown: { dx: 0, dy: NUDGE },
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'));

/** Delete, arrow nudges and Esc while Layout mode is on screen. */
export function useLayoutKeyboard() {
  useEffect(() => {
    // Saves are async. Run them one at a time, each reading the rect the last one left behind,
    // so a held arrow key cannot lose a step or write two audit events at once.
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (work: () => Promise<void>) => {
      // The store reports failures through its own `error` state.
      queue = queue.then(work).catch(() => undefined);
    };

    const nudge = async (id: FieldId, dx: number, dy: number) => {
      const state = useAppStore.getState();
      const field = state.activeBundle?.fields.find((candidate) => candidate.id === id);
      if (field) await state.updateField(id, { rect: nudgeRect(field.rect, dx, dy) });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const state = useAppStore.getState();
      if (state.editorMode !== 'layout') return;

      if (event.key === 'Escape') {
        if (state.placingType) state.setPlacingType(null);
        return;
      }

      // With a suggestion open, the field selection is not what the user is looking at.
      const id = state.selectedFieldId;
      if (!id || state.selectedSuggestionKey !== null) return;

      // Backspace too: the key labelled "delete" on a Mac sends it.
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        state.selectField(null);
        enqueue(() => useAppStore.getState().removeField(id));
        return;
      }

      const step = NUDGES[event.key];
      if (step) {
        event.preventDefault();
        enqueue(() => nudge(id, step.dx, step.dy));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
