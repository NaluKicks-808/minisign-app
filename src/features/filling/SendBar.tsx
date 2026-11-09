import { useState } from 'react';
import { canTransition } from '../../domain/stateMachine';
import { fieldIssues } from '../../domain/validation';
import { selectCurrentUserId, selectUser } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { ValidationSummary } from './ValidationSummary';
import styles from './ActionBar.module.css';

/** Uses the same guards as DocumentService.send; the service checks them again. */
export function SendBar() {
  const active = useAppStore((s) => s.activeBundle);
  const me = useAppStore(selectCurrentUserId);
  const recipient = useAppStore(selectUser(active?.document.recipientId));
  const send = useAppStore((s) => s.send);
  const [busy, setBusy] = useState(false);
  if (!active) return null;

  const { document: doc, fields, values } = active;
  const guard = canTransition(doc, 'sent', me, fields, values);
  const issues = fieldIssues(fields, values, 'sender');

  async function onSend() {
    setBusy(true);
    await send();
    setBusy(false);
  }

  return (
    <div className={styles.bar}>
      <ValidationSummary guard={guard} issues={issues} heading="Before you can send" />
      <button
        type="button"
        className={`btn btn-primary ${styles.action}`}
        data-testid="send-button"
        disabled={!guard.ok || busy}
        onClick={() => void onSend()}
      >
        {recipient ? `Send to ${recipient.name}` : 'Send'}
      </button>
    </div>
  );
}
