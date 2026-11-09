/** Contract (PRD §5). Pure. */
import type { Assignee, Field, FieldValue, UserId } from './types';
import { isAutoFilled } from './validation';

/** The values written with the status change: signerName = name, auto dates = today. */
export function computeAutofill(args: {
  fields: Field[];
  assignee: Assignee;
  signerName: string;
  filledBy: UserId;
  now: Date;
}): FieldValue[] {
  const { fields, assignee, signerName, filledBy, now } = args;
  return fields
    .filter((field) => field.assignee === assignee && isAutoFilled(field))
    .map((field) => ({
      fieldId: field.id,
      documentId: field.documentId,
      value: field.type === 'signerName' ? signerName : todayIso(now),
      filledBy,
      filledAt: now.toISOString(),
    }));
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
