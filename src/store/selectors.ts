/** Small, shared selectors. Lane C may add more. */
import type { AppState } from './useAppStore';

export const selectActive = (s: AppState) => s.activeBundle;
export const selectCurrentUserId = (s: AppState) => s.currentUserId;
export const selectFields = (s: AppState) => s.activeBundle?.fields ?? EMPTY;
export const selectSelectedField = (s: AppState) =>
  s.activeBundle?.fields.find((f) => f.id === s.selectedFieldId) ?? null;
const EMPTY: never[] = [];
