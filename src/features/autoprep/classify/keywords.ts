/** The one keyword table (PRD §10.2). Every word the classifiers react to lives here. */
import type { FieldType } from '../../../domain/types';

export type LabelKind = Exclude<FieldType, 'signerName'> | 'name';

const PARTIAL_OR_OTHER_NAME =
  /\b(?:first|last|middle|family|given|maiden|sur|street|business|company|organization|file)\b.*\bname\b|\bsurname\b/i;

/**
 * First match wins. Date sits above signature so "Date signed" and "Signature date" are dates,
 * while a plain "Signature" still is a signature.
 */
export const LABEL_KINDS: { pattern: RegExp; kind: LabelKind }[] = [
  { pattern: /\be-?mail\b/i, kind: 'email' },
  { pattern: /\b(?:phone|telephone|cellphone|tel|mobile|cell|fax)\b/i, kind: 'phone' },
  { pattern: /\b(?:date|dated)\b/i, kind: 'date' },
  { pattern: /\b(?:signature|sign here)\b/i, kind: 'signature' },
  // Part of a name, or the name of something other than the signer: the signer's name is wrong here.
  { pattern: PARTIAL_OR_OTHER_NAME, kind: 'text' },
  { pattern: /\b(?:print name|printed name|name)\b/i, kind: 'name' },
];

/**
 * The only dates that are the day of signing. Anything else (birth, expiry, hire) is a date the
 * signer must supply, and auto-filling today would silently write a wrong value.
 */
export const SIGNING_DATE =
  /^(?:(?:today['’]?s?|signature|signing|signed)\s+)?dated?(?:\s+signed)?(?:\s*\([^)]*\))?\s*:?$/i;

/** A name caption that says outright it is the signer's, so it may sit further from the signature. */
export const PRINTED_NAME = /\b(?:print|printed|signer|signer['’]s|signatory)\b/i;

export const RECIPIENT_HEADER =
  /\b(?:customer|client|recipient|buyer|purchaser|tenant|lessee|signer|employee|applicant)\b/i;

export const OPTIONAL_LABEL = /fax|optional|\(if any\)|secondary/i;

/** Long captions that reduce to one word once they sit in a signature block. */
export const SIGNATURE_BLOCK_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /\btitle\b/i, label: 'Title' },
];

/** A form's own line number ("6 City", "7a Name", "(a) First name", "12. School"). */
export const LINE_NUMBER = /^(?:\d{1,2}[a-z]?\.?|\([a-z0-9]{1,2}\))\s+(?=\S)/i;

/** Stay lowercase in a title-cased label unless they come first. */
export const MINOR_WORDS = new Set(['a', 'an', 'and', 'by', 'for', 'if', 'in', 'of', 'or', 'the', 'to']);
