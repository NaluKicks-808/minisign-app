import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Document } from '../../domain/types';
import { isMyMove, lastUpdated, selectCurrentUserId } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { StatusBadge } from './StatusBadge';
import styles from './DocumentsList.module.css';

const updatedFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function DocumentRow({ doc }: { doc: Document }) {
  const me = useAppStore(selectCurrentUserId);
  const users = useAppStore((s) => s.users);
  const navigate = useNavigate();
  const { search } = useLocation();

  const isSender = doc.senderId === me;
  const otherId = isSender ? doc.recipientId : doc.senderId;
  const other = users.find((u) => u.id === otherId);
  const path = `/documents/${doc.id}${search}`;

  return (
    <tr
      className={styles.row}
      data-testid="document-row"
      data-document-id={doc.id}
      onClick={() => navigate(path)}
    >
      <td>
        <Link to={path} className={styles.title} onClick={(e) => e.stopPropagation()}>
          {doc.title}
        </Link>
      </td>
      <td>{other?.name ?? <span className={styles.none}>No recipient yet</span>}</td>
      <td>
        <span className={isSender ? styles.roleSender : styles.roleRecipient}>
          {isSender ? 'Sender' : 'Recipient'}
        </span>
      </td>
      <td>
        <StatusBadge status={doc.status} />
      </td>
      <td>{isMyMove(doc, me) && <strong>Needs your action</strong>}</td>
      <td className={styles.updated}>{updatedFormat.format(new Date(lastUpdated(doc)))}</td>
    </tr>
  );
}

export function DocumentsList() {
  const documents = useAppStore((s) => s.documentsList);
  const newestFirst = useMemo(
    () => [...documents].sort((a, b) => lastUpdated(b).localeCompare(lastUpdated(a))),
    [documents],
  );

  if (newestFirst.length === 0) {
    return (
      <main className={styles.page}>
        <h1>Documents</h1>
        <section className={styles.empty}>
          <h2>Nothing on your desk yet</h2>
          <p>Start from a PDF, mark where each person fills in and signs, and send it on.</p>
          <Link to="/new" className="btn btn-primary">
            New document
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Documents</h1>
        <Link to="/new" className="btn btn-primary">
          New document
        </Link>
      </div>
      <div className={styles.sheet}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Other party</th>
              <th scope="col">My role</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className={styles.hidden}>Action</span>
              </th>
              <th scope="col">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
