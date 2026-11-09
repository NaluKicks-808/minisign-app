import { rectCenteredAt, type PointPx } from '../../domain/geometry';
import type { Field, FieldType } from '../../domain/types';

export const FIELD_TYPES: { type: FieldType; name: string; hint: string; w: number; h: number }[] = [
  { type: 'text', name: 'Text', hint: 'Aa', w: 0.26, h: 0.028 },
  { type: 'email', name: 'Email', hint: '@', w: 0.26, h: 0.028 },
  { type: 'phone', name: 'Phone', hint: '#', w: 0.18, h: 0.028 },
  { type: 'date', name: 'Date', hint: '31', w: 0.14, h: 0.028 },
  { type: 'signature', name: 'Signature', hint: '×', w: 0.28, h: 0.055 },
  { type: 'signerName', name: 'Signer name', hint: 'Ab', w: 0.24, h: 0.028 },
];

export const fieldTypeName = (type: FieldType) =>
  FIELD_TYPES.find((entry) => entry.type === type)?.name ?? type;

/** A default-sized box for `type`, centred where the page was clicked. */
export function newFieldDraft(
  type: FieldType,
  page: number,
  at: PointPx,
): Omit<Field, 'id' | 'documentId'> {
  const entry = FIELD_TYPES.find((candidate) => candidate.type === type);
  return {
    type,
    label: entry?.name ?? type,
    required: true,
    assignee: 'recipient',
    page,
    rect: rectCenteredAt(at, entry?.w ?? 0.26, entry?.h ?? 0.028),
    autoFillSigningDate: false,
    origin: 'manual',
  };
}
