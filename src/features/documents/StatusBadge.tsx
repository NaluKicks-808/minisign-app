import type { DocumentStatus } from '../../domain/types';
import styles from './StatusBadge.module.css';

/** The DOM text is the status word itself; CSS presents it in sentence case. */
export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`} data-testid="status-badge">
      {status}
    </span>
  );
}
