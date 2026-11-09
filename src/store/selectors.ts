/** Small, shared selectors. Lane C may add more. */
import type { Document } from '../domain/types';
import type { AppState } from './useAppStore';

export const selectActive = (s: AppState) => s.activeBundle;
export const selectCurrentUserId = (s: AppState) => s.currentUserId;
export const selectFields = (s: AppState) => s.activeBundle?.fields ?? EMPTY;
export const selectSelectedField = (s: AppState) =>
  s.activeBundle?.fields.find((f) => f.id === s.selectedFieldId) ?? null;
const EMPTY: never[] = [];

export const selectDocument = (s: AppState) => s.activeBundle?.document ?? null;

/** The user with this id, or null. */
export const selectUser = (id: string | null | undefined) => (s: AppState) =>
  s.users.find((u) => u.id === id) ?? null;

/** The stored content of one field, undefined when it has no value. */
export const selectFieldValue = (fieldId: string) => (s: AppState) =>
  s.activeBundle?.values.find((v) => v.fieldId === fieldId)?.value;

/** Whether this document is waiting on this user. */
export function isMyMove(doc: Document, userId: string): boolean {
  if (doc.status === 'draft') return doc.senderId === userId;
  if (doc.status === 'sent') return doc.recipientId === userId;
  return false;
}

export function lastUpdated(doc: Document): string {
  return doc.completedAt ?? doc.sentAt ?? doc.createdAt;
}
