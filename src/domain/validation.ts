/** Contract (PRD §6). Lane A implements. */
import { NotImplemented } from './errors';
import type { Assignee, Field, FieldIssue, FieldType, FieldValue, FieldValueContent } from './types';

export function isValidEmail(_v: string): boolean {
  throw new NotImplemented('isValidEmail');
}
export function isValidPhone(_v: string): boolean {
  throw new NotImplemented('isValidPhone');
}
/** A real calendar date in ISO YYYY-MM-DD. */
export function isValidDate(_v: string): boolean {
  throw new NotImplemented('isValidDate');
}
/** Null when valid, else a message. Handles required and optional-but-non-empty. */
export function validateValue(
  _type: FieldType,
  _value: FieldValueContent | undefined,
  _required: boolean,
): string | null {
  throw new NotImplemented('validateValue');
}
/** True for fields filled by the system at signing: signerName, and date with autoFillSigningDate. */
export function isAutoFilled(_field: Field): boolean {
  throw new NotImplemented('isAutoFilled');
}
/** Blocking problems for one party's fields, skipping auto-filled ones. */
export function fieldIssues(
  _fields: Field[],
  _values: FieldValue[],
  _assignee: Assignee,
): FieldIssue[] {
  throw new NotImplemented('fieldIssues');
}
