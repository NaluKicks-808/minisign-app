import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import type { Assignee, Field, FieldType } from '../../domain/types';
import { selectSelectedField } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { FIELD_TYPES } from './fieldDefaults';
import { useOptimisticValue } from './useOptimisticValue';
import styles from './FieldInspector.module.css';

/** Pause in typing before a label is saved. Each save is one audit event, so not per keystroke. */
const LABEL_SAVE_DELAY_MS = 400;

function LabelInput({ field }: { field: Field }) {
  const updateField = useAppStore((s) => s.updateField);
  const inputId = useId();
  const [draft, setDraft] = useState(field.label);
  const unsaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldId = field.id;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const label = unsaved.current;
    unsaved.current = null;
    if (label !== null) void updateField(fieldId, { label });
  }, [fieldId, updateField]);

  // Selecting another box can unmount this input before it ever sees a blur.
  useEffect(() => flush, [flush]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);
    const label = next.trim();
    unsaved.current = label && label !== field.label ? label : null;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, LABEL_SAVE_DELAY_MS);
  };

  return (
    <div>
      <label className="field-label" htmlFor={inputId}>
        Label
      </label>
      <input
        id={inputId}
        className="input"
        value={draft}
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter') flush();
        }}
        onBlur={() => {
          flush();
          // A field always needs a name: a blank label falls back to the saved one.
          if (!draft.trim()) setDraft(field.label);
        }}
      />
    </div>
  );
}

function Details({ field }: { field: Field }) {
  const updateField = useAppStore((s) => s.updateField);
  const removeField = useAppStore((s) => s.removeField);
  const selectField = useAppStore((s) => s.selectField);
  const typeId = useId();
  const assigneeId = useId();

  const [type, setType] = useOptimisticValue(field.type, (next: FieldType) =>
    updateField(
      field.id,
      next === 'date' ? { type: next } : { type: next, autoFillSigningDate: false },
    ),
  );
  const [assignee, setAssignee] = useOptimisticValue(field.assignee, (next: Assignee) =>
    updateField(field.id, { assignee: next }),
  );
  const [required, setRequired] = useOptimisticValue(field.required, (next: boolean) =>
    updateField(field.id, { required: next }),
  );
  const [autoFill, setAutoFill] = useOptimisticValue(field.autoFillSigningDate, (next: boolean) =>
    updateField(field.id, { autoFillSigningDate: next }),
  );

  const onDelete = () => {
    selectField(null);
    void removeField(field.id);
  };

  return (
    <div className={styles.form}>
      <LabelInput field={field} />
      <div>
        <label className="field-label" htmlFor={typeId}>
          Type
        </label>
        <select
          id={typeId}
          className="select"
          value={type}
          onChange={(event) => setType(event.target.value as FieldType)}
        >
          {FIELD_TYPES.map((entry) => (
            <option key={entry.type} value={entry.type}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor={assigneeId}>
          Assignee
        </label>
        <select
          id={assigneeId}
          className="select"
          value={assignee}
          onChange={(event) => setAssignee(event.target.value as Assignee)}
        >
          <option value="sender">Sender</option>
          <option value="recipient">Recipient</option>
        </select>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />
        Required
      </label>
      {type === 'date' && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={autoFill}
            onChange={(event) => setAutoFill(event.target.checked)}
          />
          Fill in the signing date
        </label>
      )}
      <button type="button" className={`btn btn-danger ${styles.delete}`} onClick={onDelete}>
        Delete field
      </button>
    </div>
  );
}

export function FieldInspector() {
  const field = useAppStore(selectSelectedField);

  return (
    <section className={styles.section}>
      <h2 className="panel-heading">Field details</h2>
      {field ? (
        <Details key={field.id} field={field} />
      ) : (
        <p className={styles.empty}>Select a field on the page to edit it.</p>
      )}
    </section>
  );
}
