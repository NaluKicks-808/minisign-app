import { useState } from 'react';
import { canTransition } from '../../domain/stateMachine';
import { fieldIssues } from '../../domain/validation';
import { selectCurrentUserId } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { ValidationSummary } from './ValidationSummary';
import styles from './ActionBar.module.css';

/** Uses the same guards as DocumentService.finish; the service checks them again. */
export function FinishBar() {
  const active = useAppStore((s) => s.activeBundle);
  const me = useAppStore(selectCurrentUserId);
  const finish = useAppStore((s) => s.finish);
  const [busy, setBusy] = useState(false);
  if (!active) return null;

  const { document: doc, fields, values } = active;
  const guard = canTransition(doc, 'completed', me, fields, values);
  const issues = fieldIssues(fields, values, 'recipient');

  async function onFinish() {
    setBusy(true);
    await finish();
    setBusy(false);
  }

  return (
    <div className={styles.bar}>
      <ValidationSummary guard={guard} issues={issues} heading="Before you can finish" />
      <button
        type="button"
        className={`btn btn-primary ${styles.action}`}
        data-testid="finish-button"
        disabled={!guard.ok || busy}
        onClick={() => void onFinish()}
      >
        Finish
      </button>
    </div>
  );
}
