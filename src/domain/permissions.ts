/** Contract (PRD §5). Pure. */
import type { Document, Field, UserId } from './types';
import { isAutoFilled } from './validation';

export function canView(doc: Document, actor: UserId): boolean {
  if (actor === doc.senderId) return true;
  return actor === doc.recipientId && doc.status !== 'draft';
}

export function canEditLayout(doc: Document, actor: UserId): boolean {
  return doc.status === 'draft' && actor === doc.senderId;
}

/** False for auto-filled fields (nobody types into those). */
export function canEditValue(doc: Document, field: Field, actor: UserId): boolean {
  if (isAutoFilled(field)) return false;
  if (doc.status === 'draft') return field.assignee === 'sender' && actor === doc.senderId;
  if (doc.status === 'sent') return field.assignee === 'recipient' && actor === doc.recipientId;
  return false;
}
