import { describe, expect, it } from 'vitest';
import { canTransition } from '../../../src/domain/stateMachine';
import type {
  Document,
  DocumentStatus,
  Field,
  FieldValue,
  GuardResult,
} from '../../../src/domain/types';

const SENDER = 'u_dana';
const RECIPIENT = 'u_bob';
const STRANGER = 'u_maria';

const doc = (over: Partial<Document> = {}): Document => ({
  id: 'd',
  sourceDocumentId: 's',
  title: 't',
  senderId: SENDER,
  recipientId: RECIPIENT,
  status: 'draft',
  createdAt: '',
  sentAt: null,
  completedAt: null,
  auditHead: null,
  ...over,
});
const field = (id: string, over: Partial<Field> = {}): Field => ({
  id,
  documentId: 'd',
  type: 'text',
  label: id,
  required: true,
  assignee: 'sender',
  page: 1,
  rect: { x: 0, y: 0, w: 0.1, h: 0.1 },
  autoFillSigningDate: false,
  origin: 'manual',
  ...over,
});
const value = (fieldId: string, v: FieldValue['value']): FieldValue => ({
  fieldId,
  documentId: 'd',
  value: v,
  filledBy: SENDER,
  filledAt: '',
});
const recipientField = field('recipient-box', { assignee: 'recipient', required: false });

function reasons(result: GuardResult): string[] {
  if (result.ok) throw new Error('expected the transition to be blocked');
  return result.reasons;
}

describe('canTransition: the only allowed moves', () => {
  const statuses: DocumentStatus[] = ['draft', 'sent', 'completed'];
  const actors = [SENDER, RECIPIENT, STRANGER];
  const cases = statuses.flatMap((from) =>
    statuses.flatMap((to) => actors.map((actor) => ({ from, to, actor }))),
  );

  it.each(cases)('$from to $to by $actor', ({ from, to, actor }) => {
    const result = canTransition(doc({ status: from }), to, actor, [recipientField], []);
    const allowed =
      (from === 'draft' && to === 'sent' && actor === SENDER) ||
      (from === 'sent' && to === 'completed' && actor === RECIPIENT);
    expect(result.ok).toBe(allowed);
    if (!allowed) expect(reasons(result).length).toBeGreaterThan(0);
  });
});

describe('send is blocked', () => {
  it('with no recipient', () => {
    const blocked = canTransition(doc({ recipientId: null }), 'sent', SENDER, [recipientField], []);
    expect(reasons(blocked)).toEqual(['Choose a recipient']);
  });

  it('when the recipient is the sender', () => {
    const blocked = canTransition(
      doc({ recipientId: SENDER }),
      'sent',
      SENDER,
      [recipientField],
      [],
    );
    expect(reasons(blocked)).toEqual(['Choose a recipient other than yourself']);
  });

  it('with no recipient fields', () => {
    expect(reasons(canTransition(doc(), 'sent', SENDER, [], []))).toEqual([
      'Add at least one field for the recipient',
    ]);
  });

  it('when a required sender field is empty', () => {
    const fields = [recipientField, field('Company')];
    expect(reasons(canTransition(doc(), 'sent', SENDER, fields, []))).toEqual([
      'Company is required',
    ]);
  });

  it.each([
    ['email', 'Email: enter a valid email address'],
    ['phone', 'Phone: enter a valid phone number'],
  ] as const)('when a sender %s value is invalid', (type, message) => {
    const label = type === 'email' ? 'Email' : 'Phone';
    const fields = [recipientField, field('box', { type, label })];
    expect(reasons(canTransition(doc(), 'sent', SENDER, fields, [value('box', 'nope')]))).toEqual([
      message,
    ]);
  });

  it('when a sender signature is missing', () => {
    const fields = [recipientField, field('box', { type: 'signature', label: 'Signature' })];
    expect(reasons(canTransition(doc(), 'sent', SENDER, fields, []))).toEqual([
      'Signature is required',
    ]);
  });

  it('lists every reason at once', () => {
    expect(
      reasons(canTransition(doc({ recipientId: null }), 'sent', SENDER, [field('A')], [])),
    ).toEqual(['Choose a recipient', 'Add at least one field for the recipient', 'A is required']);
  });

  it('never for auto-filled fields left empty', () => {
    const fields = [
      recipientField,
      field('Name', { type: 'signerName' }),
      field('Date', { type: 'date', autoFillSigningDate: true }),
    ];
    expect(canTransition(doc(), 'sent', SENDER, fields, [])).toEqual({ ok: true });
  });
});

describe('finish is blocked', () => {
  const sent = doc({ status: 'sent' });
  const box = (over: Partial<Field>) => field('box', { assignee: 'recipient', ...over });

  it('when a required recipient field is missing', () => {
    expect(
      reasons(canTransition(sent, 'completed', RECIPIENT, [box({ label: 'Legal Name' })], [])),
    ).toEqual(['Legal Name is required']);
  });

  it('when a required recipient field is invalid', () => {
    const fields = [box({ type: 'email', label: 'Email' })];
    expect(
      reasons(canTransition(sent, 'completed', RECIPIENT, fields, [value('box', 'x')])),
    ).toEqual(['Email: enter a valid email address']);
  });

  it('when an optional fax is non-empty and invalid', () => {
    const fields = [box({ type: 'phone', label: 'Fax', required: false })];
    expect(
      reasons(canTransition(sent, 'completed', RECIPIENT, fields, [value('box', 'x')])),
    ).toEqual(['Fax: enter a valid phone number']);
  });

  it('not when an optional fax is empty', () => {
    const fields = [box({ type: 'phone', label: 'Fax', required: false })];
    expect(canTransition(sent, 'completed', RECIPIENT, fields, [])).toEqual({ ok: true });
  });

  it('not on a sender field the recipient cannot fill', () => {
    expect(canTransition(sent, 'completed', RECIPIENT, [field('Company')], [])).toEqual({
      ok: true,
    });
  });
});
