/** Contract (PRD §5). Pure. Lane A implements. */
import { NotImplemented } from './errors';
import type { Assignee, Field, FieldValue, UserId } from './types';

/** The values written with the status change: signerName = name, auto dates = today. */
export function computeAutofill(_args: {
  fields: Field[];
  assignee: Assignee;
  signerName: string;
  filledBy: UserId;
  now: Date;
}): FieldValue[] {
  throw new NotImplemented('computeAutofill');
}
/** Local calendar date as YYYY-MM-DD. */
export function todayIso(_now: Date): string {
  throw new NotImplemented('todayIso');
}
