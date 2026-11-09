/** Contract (PRD §5). Pure. */
import type { Document, DocumentStatus, Field, FieldValue, GuardResult, UserId } from './types';
import { fieldIssues } from './validation';

function result(reasons: string[]): GuardResult {
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function canSend(doc: Document, actor: UserId, fields: Field[], values: FieldValue[]): GuardResult {
  if (actor !== doc.senderId) return result(['Only the sender can send this document']);
  const reasons: string[] = [];
  if (doc.recipientId === null) reasons.push('Choose a recipient');
  else if (doc.recipientId === doc.senderId) reasons.push('Choose a recipient other than yourself');
  if (!fields.some((f) => f.assignee === 'recipient')) {
    reasons.push('Add at least one field for the recipient');
  }
  reasons.push(...fieldIssues(fields, values, 'sender').map((issue) => issue.message));
  return result(reasons);
}

function canFinish(
  doc: Document,
  actor: UserId,
  fields: Field[],
  values: FieldValue[],
): GuardResult {
  if (actor !== doc.recipientId) return result(['Only the recipient can finish this document']);
  return result(fieldIssues(fields, values, 'recipient').map((issue) => issue.message));
}

export function canTransition(
  doc: Document,
  to: DocumentStatus,
  actor: UserId,
  fields: Field[],
  values: FieldValue[],
): GuardResult {
  if (doc.status === 'draft' && to === 'sent') return canSend(doc, actor, fields, values);
  if (doc.status === 'sent' && to === 'completed') return canFinish(doc, actor, fields, values);
  return result([`A ${doc.status} document cannot become ${to}`]);
}
