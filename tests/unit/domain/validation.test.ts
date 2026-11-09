import { describe, expect, it } from 'vitest';
import {
  fieldIssues,
  isValidDate,
  isValidEmail,
  isValidPhone,
  validateValue,
} from '../../../src/domain/validation';
import type { Field, FieldValue } from '../../../src/domain/types';

describe('isValidEmail', () => {
  it.each([
    'a@b.co',
    'bob@acmetrucking.example',
    'first.last@example.com',
    'user+tag@sub.example.org',
    'x_y-z@example.io',
    "o'neil@example.ie",
    'UPPER@EXAMPLE.COM',
  ])('accepts %s', (v) => expect(isValidEmail(v)).toBe(true));

  it.each([
    '',
    'plain',
    '@example.com',
    'a@b',
    'a@@b.co',
    'a@b@c.co',
    'a b@c.co',
    'a@b c.co',
    ' a@b.co',
    'a@b.',
    'a@.com',
    'a@b..com',
  ])('rejects "%s"', (v) => expect(isValidEmail(v)).toBe(false));
});

describe('isValidPhone', () => {
  it.each([
    '5551234',
    '555-123-4567',
    '(555) 123-4567',
    '555.123.4567',
    '+1 555 123 4567',
    '+442079460958',
    '123456789012345',
  ])('accepts %s', (v) => expect(isValidPhone(v)).toBe(true));

  it.each([
    '',
    '123456',
    '1234567890123456',
    '555-CALL-NOW',
    '++15551234',
    '555+1234567',
    '+',
    '---',
  ])('rejects "%s"', (v) => expect(isValidPhone(v)).toBe(false));
});

describe('isValidDate', () => {
  it.each([
    '2026-01-01',
    '2026-12-31',
    '2024-02-29',
    '2000-02-29',
    '1999-11-30',
    '0099-06-15',
    '2026-04-30',
  ])('accepts %s', (v) => expect(isValidDate(v)).toBe(true));

  it.each([
    '',
    '2026-13-01',
    '2026-00-10',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-01-00',
    '01/02/2026',
    '2026-1-1',
    '2026-01-01T00:00:00Z',
    'tomorrow',
      '0000-01-01',
  ])('rejects "%s"', (v) => expect(isValidDate(v)).toBe(false));
});

describe('validateValue', () => {
  it('treats an empty optional field as valid and an empty required field as invalid', () => {
    expect(validateValue('phone', undefined, false)).toBeNull();
    expect(validateValue('phone', '   ', false)).toBeNull();
    expect(validateValue('text', '   ', true)).not.toBeNull();
    expect(validateValue('signature', undefined, true)).not.toBeNull();
  });

  it('holds a non-empty optional field to its type check', () => {
    expect(validateValue('phone', 'nope', false)).not.toBeNull();
    expect(validateValue('email', 'nope', false)).not.toBeNull();
  });

  it('requires 2 non-space characters for a typed signature and ink for a drawn one', () => {
    expect(validateValue('signature', { kind: 'typed', text: 'a ' }, true)).not.toBeNull();
    expect(validateValue('signature', { kind: 'typed', text: 'a b' }, true)).toBeNull();
    expect(validateValue('signature', { kind: 'drawn', pngDataUrl: '' }, true)).not.toBeNull();
    expect(
      validateValue('signature', { kind: 'drawn', pngDataUrl: 'data:image/png;base64,x' }, true),
    ).toBeNull();
  });
});

describe('fieldIssues', () => {
  const field = (id: string, label: string, over: Partial<Field>): Field => ({
    id,
    documentId: 'd',
    type: 'text',
    label,
    required: true,
    assignee: 'sender',
    page: 1,
    rect: { x: 0, y: 0, w: 0.1, h: 0.1 },
    autoFillSigningDate: false,
    origin: 'manual',
    ...over,
  });
  const value = (fieldId: string, v: string): FieldValue => ({
    fieldId,
    documentId: 'd',
    value: v,
    filledBy: 'u',
    filledAt: '',
  });

  it('words issues for the summary and covers only that party', () => {
    const fields = [
      field('a', 'Signature', { type: 'signature' }),
      field('b', 'Email', { type: 'email' }),
      field('c', 'Recipient Name', { assignee: 'recipient' }),
    ];
    expect(fieldIssues(fields, [value('b', 'nope')], 'sender')).toEqual([
      { fieldId: 'a', label: 'Signature', message: 'Signature is required' },
      { fieldId: 'b', label: 'Email', message: 'Email: enter a valid email address' },
    ]);
  });

  it('skips auto-filled fields', () => {
    const fields = [
      field('a', 'Name', { type: 'signerName' }),
      field('b', 'Date', { type: 'date', autoFillSigningDate: true }),
    ];
    expect(fieldIssues(fields, [], 'sender')).toEqual([]);
  });
});
