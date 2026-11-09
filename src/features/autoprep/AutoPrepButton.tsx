import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import styles from './autoprep.module.css';

/** Reads the store. No props. */
export function AutoPrepButton() {
  const runAutoPrep = useAppStore((s) => s.runAutoPrep);
  const selectSuggestion = useAppStore((s) => s.selectSuggestion);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    setEmpty(false);
    try {
      await runAutoPrep();
      const { suggestions, selectedSuggestionKey, error } = useAppStore.getState();
      const first = suggestions[0];
      if (first && !selectedSuggestionKey) selectSuggestion(first.key);
      setEmpty(suggestions.length === 0 && error === null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.run}>
      <button
        type="button"
        className="btn"
        data-testid="autoprep-button"
        disabled={busy}
        onClick={() => void handleClick()}
      >
        {busy ? 'Reading the document…' : 'Auto-prep'}
      </button>
      <p className={styles.hint}>Reads the document and suggests fields for you to review.</p>
      {empty && (
        <p className={styles.hint} role="status">
          No new fields found on this document.
        </p>
      )}
    </div>
  );
}
