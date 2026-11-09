import { useState } from 'react';
import type { FieldSuggestion } from '../../domain/autoprep';
import { rectToStyle } from '../../domain/geometry';
import type { Assignee, FieldType } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import styles from './autoprep.module.css';

const TYPE_NAMES: Record<FieldType, string> = {
  text: 'Text',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  signature: 'Signature',
  signerName: 'Signer name',
};
const FIELD_TYPES = Object.keys(TYPE_NAMES) as FieldType[];
const ASSIGNEES: { value: Assignee; name: string }[] = [
  { value: 'sender', name: 'Sender' },
  { value: 'recipient', name: 'Recipient' },
];

/** The dashed boxes on one page, inside PageSurface. */
export function SuggestionLayer({ page }: { page: number }) {
  const suggestions = useAppStore((s) => s.suggestions);
  const selectedKey = useAppStore((s) => s.selectedSuggestionKey);
  const selectSuggestion = useAppStore((s) => s.selectSuggestion);

  return (
    <>
      {suggestions
        .filter((s) => s.page === page)
        .map((s) => {
          const selected = s.key === selectedKey;
          return (
            <button
              key={s.key}
              type="button"
              className={selected ? `${styles.box} ${styles.boxSelected}` : styles.box}
              style={rectToStyle(s.rect)}
              data-testid="suggestion-box"
              data-label={s.label}
              data-field-type={s.type}
              data-assignee={s.assignee}
              data-page={s.page}
              aria-label={`Suggested field: ${s.label}, ${TYPE_NAMES[s.type]}`}
              aria-pressed={selected}
              title={s.evidence}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                // The page underneath would otherwise treat this as a click to place a field.
                event.stopPropagation();
                selectSuggestion(s.key);
              }}
            >
              <span className={styles.boxType}>{TYPE_NAMES[s.type]}</span>
              <span className={styles.boxLabel}>{s.label}</span>
            </button>
          );
        })}
    </>
  );
}

/** Edit form and Accept/Reject for the selected suggestion, plus accept-all and reject-all. */
export function SuggestionInspector() {
  const suggestions = useAppStore((s) => s.suggestions);
  const selectedKey = useAppStore((s) => s.selectedSuggestionKey);
  const updateSuggestion = useAppStore((s) => s.updateSuggestion);
  const acceptSuggestions = useAppStore((s) => s.acceptSuggestions);
  const rejectSuggestions = useAppStore((s) => s.rejectSuggestions);
  const selectSuggestion = useAppStore((s) => s.selectSuggestion);
  const [busy, setBusy] = useState(false);

  if (suggestions.length === 0) return null;
  const selected = suggestions.find((s) => s.key === selectedKey) ?? null;
  const allKeys = suggestions.map((s) => s.key);

  const run = async (command: (keys: string[]) => Promise<void>, keys: string[]) => {
    setBusy(true);
    try {
      await command(keys);
      // Keep the review moving: open whichever suggestion is next.
      const { suggestions: left, selectedSuggestionKey } = useAppStore.getState();
      if (!left.some((s) => s.key === selectedSuggestionKey)) {
        selectSuggestion(left[0]?.key ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  const edit = (patch: Partial<FieldSuggestion>) => {
    if (selected) updateSuggestion(selected.key, patch);
  };

  return (
    <section className={styles.inspector} aria-label="Suggestions">
      <h3>Review suggestions</h3>
      <p className={styles.count} data-testid="suggestion-count">
        {suggestions.length === 1 ? '1 suggestion left' : `${suggestions.length} suggestions left`}
      </p>

      {selected ? (
        <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
          <div>
            <label className="field-label" htmlFor="suggestion-label">
              Label
            </label>
            <input
              id="suggestion-label"
              className="input"
              value={selected.label}
              onChange={(event) => edit({ label: event.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="suggestion-type">
              Type
            </label>
            <select
              id="suggestion-type"
              className="select"
              value={selected.type}
              onChange={(event) => {
                const type = event.target.value as FieldType;
                edit({ type, autoFillSigningDate: type === 'date' && selected.autoFillSigningDate });
              }}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_NAMES[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="suggestion-assignee">
              Assignee
            </label>
            <select
              id="suggestion-assignee"
              className="select"
              value={selected.assignee}
              onChange={(event) => edit({ assignee: event.target.value as Assignee })}
            >
              {ASSIGNEES.map((assignee) => (
                <option key={assignee.value} value={assignee.value}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={selected.required}
              onChange={(event) => edit({ required: event.target.checked })}
            />
            Required
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void run(acceptSuggestions, [selected.key])}
            >
              Accept
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void run(rejectSuggestions, [selected.key])}
            >
              Reject
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.hint}>Select a dashed box to edit it.</p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(acceptSuggestions, allKeys)}
        >
          Accept all
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(rejectSuggestions, allKeys)}
        >
          Reject all
        </button>
      </div>
    </section>
  );
}
