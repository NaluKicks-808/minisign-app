/** Contract (PRD §5). Pure. Lane A implements. */
import { NotImplemented } from './errors';
import type { Document, Field, UserId } from './types';

export function canView(_doc: Document, _actor: UserId): boolean {
  throw new NotImplemented('canView');
}
export function canEditLayout(_doc: Document, _actor: UserId): boolean {
  throw new NotImplemented('canEditLayout');
}
/** False for auto-filled fields (nobody types into those). */
export function canEditValue(_doc: Document, _field: Field, _actor: UserId): boolean {
  throw new NotImplemented('canEditValue');
}
