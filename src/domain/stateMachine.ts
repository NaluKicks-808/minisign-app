/** Contract (PRD §5). Pure. Lane A implements. */
import { NotImplemented } from './errors';
import type { Document, DocumentStatus, Field, FieldValue, GuardResult, UserId } from './types';

export function canTransition(
  _doc: Document,
  _to: DocumentStatus,
  _actor: UserId,
  _fields: Field[],
  _values: FieldValue[],
): GuardResult {
  throw new NotImplemented('canTransition');
}
