import { useAppStore } from '../../store/useAppStore';
import { FIELD_TYPES } from './fieldDefaults';
import styles from './FieldPalette.module.css';

export function FieldPalette() {
  const placingType = useAppStore((s) => s.placingType);
  const setPlacingType = useAppStore((s) => s.setPlacingType);
  const armedName = FIELD_TYPES.find((entry) => entry.type === placingType)?.name;

  return (
    <section className={styles.section}>
      <h3>Add a field</h3>
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
      <p className={styles.note} aria-live="polite">
        {armedName
          ? `Click the page to place ${armedName.toLowerCase()}. Esc cancels.`
          : 'Pick a type, then click the page. Blue flags are for the sender, amber flags for the recipient.'}
      </p>
    </section>
  );
}
