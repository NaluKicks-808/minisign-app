import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { UploadSource } from './UploadSource';
import styles from './NewDocument.module.css';

export function NewDocument() {
  const sources = useAppStore((s) => s.sourceDocuments);
  const createDocument = useAppStore((s) => s.createDocument);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function start(sourceId: string) {
    setCreating(true);
    try {
      const doc = await createDocument(sourceId);
      navigate(`/documents/${doc.id}`);
    } catch {
      // The store has already put the failure in the error banner.
      setCreating(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link to="/" className={styles.back}>
        Back to documents
      </Link>
      <h1>New document</h1>
      <p className={styles.lead}>Pick the PDF to prepare. The original always stays blank.</p>
      <ul className={styles.sources}>
        {sources.map((source) => (
          <li key={source.id} className={styles.source}>
            <div>
              <h2 className={styles.sourceTitle}>{source.title}</h2>
              <span className={styles.pages}>
                {source.pageCount} {source.pageCount === 1 ? 'page' : 'pages'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating}
              onClick={() => void start(source.id)}
            >
              Use this document
            </button>
          </li>
        ))}
      </ul>
      <section className={styles.upload}>
        <h2 className={styles.sourceTitle}>Or bring your own</h2>
        <UploadSource onCreated={(sourceId) => void start(sourceId)} />
      </section>
    </main>
  );
}
