import type { AuditEvent, Document, Field, User } from '../../domain/types';

interface Context {
  document: Document;
  fields: Field[];
  users: User[];
}

const asText = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

function fieldName(event: AuditEvent, fields: Field[]): string {
  const { label, fieldLabel, fieldId } = event.data;
  const name =
    asText(label) ?? asText(fieldLabel) ?? fields.find((f) => f.id === fieldId)?.label ?? null;
  return name ? `“${name}”` : 'a field';
}

function count(event: AuditEvent, noun: string): string {
  const n = event.data.count;
  if (typeof n !== 'number') return `${noun}s`;
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** The plain-words sentence for one audit event, without its time. */
export function describeEvent(event: AuditEvent, { document, fields, users }: Context): string {
  const nameOf = (id: unknown) => users.find((u) => u.id === id)?.name ?? null;
  const actor = nameOf(event.actorId) ?? 'Someone';
  const recipient =
    nameOf(event.data.recipientId) ??
    nameOf(event.data.userId) ??
    asText(event.data.email) ??
    nameOf(document.recipientId) ??
    'the recipient';

  switch (event.type) {
    case 'document.created':
      return `${actor} created this document`;
    case 'field.added':
      return `${actor} added ${fieldName(event, fields)}`;
    case 'field.updated':
      return `${actor} changed ${fieldName(event, fields)}`;
    case 'field.removed':
      return `${actor} removed ${fieldName(event, fields)}`;
    case 'value.set':
      return `${actor} filled in ${fieldName(event, fields)}`;
    case 'recipient.set':
      return `${actor} chose ${recipient} as the recipient`;
    case 'autoprep.suggested':
      return `Auto-prep suggested ${count(event, 'field')} to ${actor}`;
    case 'autoprep.accepted':
      return `${actor} accepted ${count(event, 'suggested field')}`;
    case 'autoprep.rejected':
      return `${actor} rejected ${count(event, 'suggested field')}`;
    case 'document.sent':
      return `${actor} sent this to ${recipient}`;
    case 'document.viewed':
      return `${actor} opened this`;
    case 'document.completed':
      return `${actor} finished this`;
  }
}
