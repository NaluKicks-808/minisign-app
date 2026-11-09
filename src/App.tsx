/** Routes and shell. */
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DocumentScreen } from './features/documents/DocumentScreen';
import { DocumentsList } from './features/documents/DocumentsList';
import { NewDocument } from './features/documents/NewDocument';
import { Header } from './features/session/Header';
import { useAppStore } from './store/useAppStore';
import styles from './App.module.css';

function ErrorBanner() {
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  if (!error) return null;
  return (
    <div className={styles.error} role="alert">
      <span>{error}</span>
      <button type="button" className={styles.dismiss} onClick={clearError}>
        Dismiss
      </button>
    </div>
  );
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return null;

  return (
    <BrowserRouter>
      <div className={styles.shell}>
        <Header />
        <ErrorBanner />
        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<DocumentsList />} />
            <Route path="/new" element={<NewDocument />} />
            <Route path="/documents/:id" element={<DocumentScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
