import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { selectCurrentUserId, selectUser } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { ActivityPanel } from '../activity/ActivityPanel';
import { DocumentFields } from '../filling/DocumentFields';
import { FinishBar } from '../filling/FinishBar';
import { SendBar } from '../filling/SendBar';
import { SignatureModal } from '../filling/SignatureModal';
import { LayoutEditor } from '../layout-editor/LayoutEditor';
import { RecipientPicker } from '../layout-editor/RecipientPicker';
import { StatusBadge } from './StatusBadge';
import styles from './DocumentScreen.module.css';

function Prepare() {
  const mode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);

  return (
    <>
      <div role="tablist" aria-label="Document mode" className={styles.tabs}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'layout'}
          className={styles.tab}
          onClick={() => setEditorMode('layout')}
        >
          Layout
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'fill'}
          className={styles.tab}
          onClick={() => setEditorMode('fill')}
        >
          Fill
        </button>
      </div>
      <div role="tabpanel" className={styles.pages}>
        {mode === 'layout' ? <LayoutEditor /> : <DocumentFields />}
      </div>
      <div className={styles.dock}>
        <RecipientPicker />
        <SendBar />
      </div>
    </>
  );
}

function Banner({ tone, children }: { tone: 'sent' | 'completed'; children: string }) {
  return <p className={`${styles.banner} ${styles[tone]}`}>{children}</p>;
}

const completedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

function Sign() {
  const sender = useAppStore((s) => selectUser(s.activeBundle?.document.senderId)(s));
  return (
    <>
      <Banner tone="sent">
        {`${sender?.name ?? 'The sender'} sent this for you to complete. The amber fields are yours.`}
      </Banner>
      <div className={styles.pages}>
        <DocumentFields />
      </div>
      <div className={styles.dock}>
        <FinishBar />
      </div>
    </>
  );
}

function ReadOnly() {
  const doc = useAppStore((s) => s.activeBundle?.document);
  const recipient = useAppStore((s) => selectUser(s.activeBundle?.document.recipientId)(s));
  if (!doc) return null;
  return (
    <>
      {doc.status === 'completed' ? (
        <Banner tone="completed">
          {`Completed${doc.completedAt ? ` on ${completedFormat.format(new Date(doc.completedAt))}` : ''}. This document is locked.`}
        </Banner>
      ) : (
        <Banner tone="sent">
          {`Sent to ${recipient?.name ?? 'the recipient'}, waiting for them to finish. Your copy is locked.`}
        </Banner>
      )}
      <div className={styles.pages}>
        <DocumentFields />
      </div>
    </>
  );
}

function Unavailable() {
  return (
    <main className={styles.unavailable}>
      <h1>This document isn’t available</h1>
      <p>It may not exist, or it may not be shared with the person you’re acting as.</p>
      <Link to="/" className="btn">
        Back to documents
      </Link>
    </main>
  );
}

export function DocumentScreen() {
  const { id } = useParams<{ id: string }>();
  const openDocument = useAppStore((s) => s.openDocument);
  const closeDocument = useAppStore((s) => s.closeDocument);
  const me = useAppStore(selectCurrentUserId);
  const doc = useAppStore((s) => s.activeBundle?.document ?? null);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let current = true;
    void openDocument(id).then(() => {
      if (current && !useAppStore.getState().activeBundle) setFailedId(id);
    });
    return () => {
      current = false;
      closeDocument();
    };
  }, [id, openDocument, closeDocument]);

  if (failedId === id) return <Unavailable />;
  if (!doc || doc.id !== id) return null;

  const body =
    doc.status === 'draft' && doc.senderId === me ? (
      <Prepare />
    ) : doc.status === 'sent' && doc.recipientId === me ? (
      <Sign />
    ) : (
      <ReadOnly />
    );

  return (
    <div className={styles.screen}>
      <main className={styles.main}>
        <div className={styles.heading}>
          <Link to="/" className={styles.back}>
            Documents
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{doc.title}</h1>
            <StatusBadge status={doc.status} />
          </div>
        </div>
        {body}
      </main>
      <aside className={`panel ${styles.side}`} aria-label="Activity" tabIndex={0}>
        <ActivityPanel />
      </aside>
      <SignatureModal />
    </div>
  );
}
