/** The one keyword table (PRD §10.2). Every word the classifiers react to lives here. */
import type { FieldType } from '../../../domain/types';

export type LabelKind = Exclude<FieldType, 'signerName'> | 'name';

/**
 * First match wins. Date sits above signature so "Date signed" and "Signature date" are dates,
 * while a plain "Signature" still is a signature.
 */
export const LABEL_KINDS: { pattern: RegExp; kind: LabelKind }[] = [
  { pattern: /\be-?mail\b/i, kind: 'email' },
  { pattern: /\b(?:phone|telephone|cellphone|tel|mobile|cell|fax)\b/i, kind: 'phone' },
  { pattern: /\b(?:date|dated)\b/i, kind: 'date' },
  { pattern: /\b(?:signature|sign here)\b/i, kind: 'signature' },
  { pattern: /\b(?:print name|printed name|name)\b/i, kind: 'name' },
];

export const RECIPIENT_HEADER =
  /\b(?:customer|client|recipient|buyer|purchaser|tenant|lessee|signer|employee|applicant)\b/i;

export const OPTIONAL_LABEL = /fax|optional|\(if any\)|secondary/i;

/** Long captions that reduce to one word once they sit in a signature block. */
export const SIGNATURE_BLOCK_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /\btitle\b/i, label: 'Title' },
];

/** Stay lowercase in a title-cased label unless they come first. */
export const MINOR_WORDS = new Set(['a', 'an', 'and', 'by', 'for', 'if', 'in', 'of', 'or', 'the', 'to']);
