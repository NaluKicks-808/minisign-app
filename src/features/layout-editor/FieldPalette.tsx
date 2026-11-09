import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FIELD_TYPES, newFieldDraft } from './fieldDefaults';
import styles from './FieldPalette.module.css';

export function FieldPalette() {
  const placingType = useAppStore((s) => s.placingType);
  const setPlacingType = useAppStore((s) => s.setPlacingType);
  const addField = useAppStore((s) => s.addField);
  const selectField = useAppStore((s) => s.selectField);
  const pageCount = useAppStore((s) => s.activeBundle?.source.pageCount ?? 1);
  const [page, setPage] = useState(1);
  const armedName = FIELD_TYPES.find((entry) => entry.type === placingType)?.name;

  /** The route that needs no mouse: drop the armed field mid-page, then arrow keys move it. */
  const placeOnPage = async () => {
    if (!placingType) return;
    setPlacingType(null);
    const field = await addField(newFieldDraft(placingType, page, { x: 0.5, y: 0.5 }));
    if (field) selectField(field.id);
  };

  return (
    <section className={styles.section}>
      <h2 className="panel-heading">Add a field</h2>
      <div className={styles.grid}>
        {FIELD_TYPES.map(({ type, name, hint }) => (
          <button
            key={type}
            type="button"
            className={styles.item}
            aria-pressed={placingType === type}
            data-testid={`palette-${type}`}
            onClick={() => setPlacingType(placingType === type ? null : type)}
          >
            <span className={styles.flag} aria-hidden="true" />
            {name}
            <span className={styles.hint} aria-hidden="true">
              {hint}
            </span>
          </button>
        ))}
      </div>
      {armedName && (
        <div className={styles.placeRow}>
          <label>
            Page{' '}
            <select value={page} onChange={(event) => setPage(Number(event.target.value))}>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" data-testid="place-on-page" onClick={() => void placeOnPage()}>
            Place on this page
          </button>
        </div>
      )}
      <p className={styles.note} aria-live="polite">
        {armedName
          ? `Click the page to place ${armedName.toLowerCase()}, or use Place on this page. Esc cancels.`
          : 'Pick a type, then click the page. Blue flags are for the sender, amber flags for the recipient.'}
      </p>
    </section>
  );
}
