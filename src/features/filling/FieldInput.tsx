import { useId, useState } from 'react';
import { canEditValue } from '../../domain/permissions';
import type { Document, Field, FieldValueContent, SignatureValue } from '../../domain/types';
import { isAutoFilled, validateValue } from '../../domain/validation';
import { selectCurrentUserId, selectDocument, selectFieldValue } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import styles from './FieldInput.module.css';

const INPUT_TYPES: Partial<Record<Field['type'], string>> = {
  email: 'email',
  phone: 'tel',
  date: 'date',
};

const withStar = (field: Field) => (field.required ? `${field.label} *` : field.label);

function ErrorTip({ id, message }: { id: string; message: string }) {
  return (
    <span id={id} className={styles.tip}>
      {message}
    </span>
  );
}

function TextualInput({ field, stored }: { field: Field; stored: string }) {
  const setValue = useAppStore((s) => s.setValue);
  // Only the keystrokes not yet committed live here; the repository holds the value.
  const [draft, setDraft] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const errorId = useId();

  const shown = draft ?? stored;
  const message =
    touched || stored !== ''
      ? validateValue(field.type, shown === '' ? undefined : shown, field.required)
      : null;

  async function commit() {
    setTouched(true);
    if (draft === null) return;
    if (draft !== stored) await setValue(field.id, draft === '' ? null : draft);
    setDraft((current) => (current === draft ? null : current));
  }

  return (
    <>
      <input
        data-testid="field-input"
        className={styles.input}
        type={INPUT_TYPES[field.type] ?? 'text'}
        aria-label={field.label}
        aria-required={field.required}
        aria-invalid={message !== null}
        aria-describedby={message ? errorId : undefined}
        placeholder={withStar(field)}
        autoComplete="off"
        spellCheck={false}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit();
        }}
      />
      {message && <ErrorTip id={errorId} message={message} />}
    </>
  );
}

function SignatureMark({ label, value }: { label: string; value: SignatureValue }) {
  if (value.kind === 'drawn') {
    return <img className={styles.drawn} src={value.pngDataUrl} alt={`Signature: ${label}`} />;
  }
  return <span className={styles.typedSignature}>{value.text}</span>;
}

function SignatureButton({ field, stored }: { field: Field; stored: SignatureValue | undefined }) {
  const openSignatureModal = useAppStore((s) => s.openSignatureModal);
  const errorId = useId();
  const message = stored ? validateValue('signature', stored, field.required) : null;

  return (
    <>
      <button
        type="button"
        data-testid="field-input"
        className={stored ? styles.signature : `${styles.signature} ${styles.unsigned}`}
        aria-label={field.label}
        aria-invalid={message !== null}
        aria-describedby={message ? errorId : undefined}
        onClick={() => openSignatureModal(field.id)}
      >
        {stored ? <SignatureMark label={field.label} value={stored} /> : withStar(field)}
      </button>
      {message && <ErrorTip id={errorId} message={message} />}
    </>
  );
}

function ReadOnlyValue({
  doc,
  field,
  value,
}: {
  doc: Document;
  field: Field;
  value: FieldValueContent | undefined;
}) {
  if (value !== undefined) {
    if (typeof value === 'string') {
      return (
        <span className={styles.value} title={field.label}>
          {value}
        </span>
      );
    }
    return (
      <span className={styles.signed} title={field.label}>
        <SignatureMark label={field.label} value={value} />
      </span>
    );
  }
  if (doc.status === 'completed') return null;
  if (isAutoFilled(field)) {
    return (
      <span className={styles.placeholder} title={field.label}>
        Fills in on signing
      </span>
    );
  }
  if (field.assignee === 'recipient') {
    return <span className={styles.placeholder}>{withStar(field)}</span>;
  }
  return null;
}

/** One field in Fill, signing or read-only mode: the whole box, hooks included. */
export function FieldInput({ field }: { field: Field }) {
  const doc = useAppStore(selectDocument);
  const me = useAppStore(selectCurrentUserId);
  const value = useAppStore(selectFieldValue(field.id));
  if (!doc) return null;

  const editable = canEditValue(doc, field, me);

  return (
    <div className={`${styles.box} ${styles[field.assignee]}`}>
      {!editable && <ReadOnlyValue doc={doc} field={field} value={value} />}
      {editable && field.type === 'signature' && (
        <SignatureButton
          field={field}
          stored={typeof value === 'object' ? value : undefined}
        />
      )}
      {editable && field.type !== 'signature' && (
        <TextualInput field={field} stored={typeof value === 'string' ? value : ''} />
      )}
    </div>
  );
}
