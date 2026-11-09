/** Contract (PRD §6). Pure. */
import type {
  Assignee,
  Field,
  FieldIssue,
  FieldType,
  FieldValue,
  FieldValueContent,
} from './types';

const REQUIRED_MESSAGE = 'This field is required';

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}

export function isValidPhone(v: string): boolean {
  return /^\+?\d{7,15}$/.test(v.replace(/[\s\-.()]/g, ''));
}

/** A real calendar date in ISO YYYY-MM-DD. */
export function isValidDate(v: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year === 0) return false;
  // setUTCFullYear rolls impossible dates over (Feb 30 becomes Mar 2), so a round trip detects them.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const STRING_CHECKS: Partial<
  Record<FieldType, { valid: (v: string) => boolean; message: string }>
> = {
  email: { valid: isValidEmail, message: 'Enter a valid email address' },
  phone: { valid: isValidPhone, message: 'Enter a valid phone number' },
  date: { valid: isValidDate, message: 'Enter a valid date' },
};

function isBlank(value: FieldValueContent): boolean {
  if (typeof value === 'string') return value.trim() === '';
  return value.kind === 'typed' ? value.text.trim() === '' : value.pngDataUrl === '';
}

/** Null when valid, else a message. Handles required and optional-but-non-empty. */
export function validateValue(
  type: FieldType,
  value: FieldValueContent | undefined,
  required: boolean,
): string | null {
  if (type === 'signerName') return null;
  if (value === undefined || isBlank(value)) return required ? REQUIRED_MESSAGE : null;

  if (type === 'signature') {
    const signed =
      typeof value !== 'string' &&
      (value.kind === 'drawn' || value.text.replace(/\s/g, '').length >= 2);
    return signed ? null : 'Enter a signature with at least 2 characters';
  }
  if (typeof value !== 'string') return 'Enter text, not a signature';
  const check = STRING_CHECKS[type];
  return check && !check.valid(value) ? check.message : null;
}

/** True for fields filled by the system at signing: signerName, and date with autoFillSigningDate. */
export function isAutoFilled(field: Field): boolean {
  return field.type === 'signerName' || (field.type === 'date' && field.autoFillSigningDate);
}

/** Blocking problems for one party's fields, skipping auto-filled ones. */
export function fieldIssues(
  fields: Field[],
  values: FieldValue[],
  assignee: Assignee,
): FieldIssue[] {
  const valueByField = new Map(values.map((v) => [v.fieldId, v.value]));
  const issues: FieldIssue[] = [];
  for (const field of fields) {
    if (field.assignee !== assignee || isAutoFilled(field)) continue;
    const error = validateValue(field.type, valueByField.get(field.id), field.required);
    if (error === null) continue;
    const message =
      error === REQUIRED_MESSAGE
        ? `${field.label} is required`
        : `${field.label}: ${error.charAt(0).toLowerCase()}${error.slice(1)}`;
    issues.push({ fieldId: field.id, label: field.label, message });
  }
  return issues;
}
