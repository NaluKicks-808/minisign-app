import { STORAGE_KEY, type StoredState } from '../../data/repository';
import { useAppStore } from '../../store/useAppStore';
import { describeEvent } from './describeEvent';
import styles from './ActivityPanel.module.css';

const showTamper = () =>
  import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1';

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayAndClock = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatWhen(iso: string): string {
  const at = new Date(iso);
  return (at.toDateString() === new Date().toDateString() ? clock : dayAndClock).format(at);
}

/** Demo only: changes one stored event directly, past the service, as an attacker would. */
function tamperWithStoredEvent(documentId: string): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const state = JSON.parse(raw) as StoredState;
  const own = state.events.filter((e) => e.documentId === documentId);
  const target = own[Math.floor(own.length / 2)];
  if (!target) return;
  target.data = { ...target.data, tampered: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function ActivityPanel() {
  const active = useAppStore((s) => s.activeBundle);
  const users = useAppStore((s) => s.users);
  const refreshActive = useAppStore((s) => s.refreshActive);
  if (!active) return null;

  const { document, fields, events, integrity } = active;
  const brokenAt = integrity.ok ? null : integrity.brokenAtSeq;
  const inOrder = [...events].sort((a, b) => a.seq - b.seq);

  function tamper() {
    tamperWithStoredEvent(document.id);
    void refreshActive();
  }

  return (
    <section className={styles.panel} data-testid="activity-panel" aria-label="Activity">
      <div className={styles.top}>
        <h2 className={styles.title}>Activity</h2>
        <span
          className={integrity.ok ? styles.intact : styles.altered}
          data-testid="integrity-badge"
        >
          {integrity.ok ? 'History intact ✓' : `History altered at event #${brokenAt}`}
        </span>
      </div>
      <ol className={styles.events}>
        {inOrder.map((event) => (
          <li key={event.id} className={event.seq === brokenAt ? styles.broken : styles.event}>
            <span className={styles.seq}>#{event.seq}</span>
            <span>
              {describeEvent(event, { document, fields, users })} · {formatWhen(event.at)}
            </span>
          </li>
        ))}
      </ol>
      {showTamper() && (
        <button
          type="button"
          className={`btn btn-danger ${styles.tamper}`}
          data-testid="tamper-button"
          onClick={tamper}
        >
          Tamper with history (demo)
        </button>
      )}
    </section>
  );
}
