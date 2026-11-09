import { useState, type ChangeEvent } from 'react';
import { readPdfInfo } from '../autoprep/pageContent/pdfjsPageContent';
import { useAppStore } from '../../store/useAppStore';
import styles from './UploadSource.module.css';

const MAX_BYTES = 3 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** Upload a PDF, then call onCreated with the new source id. */
export function UploadSource({ onCreated }: { onCreated: (sourceId: string) => void }) {
  const addSourceDocument = useAppStore((s) => s.addSourceDocument);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setError('That file is not a PDF. Choose a PDF file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      const size = (file.size / (1024 * 1024)).toFixed(2);
      setError(`That PDF is ${size} MB. The limit is 3 MB.`);
      return;
    }
    let info;
    let fileUrl;
    try {
      fileUrl = await readAsDataUrl(file);
      info = await readPdfInfo(new Uint8Array(await file.arrayBuffer()));
    } catch {
      setError('That file could not be read as a PDF.');
      return;
    }
    try {
      const source = await addSourceDocument({
        title: file.name.replace(/\.pdf$/i, ''),
        fileUrl,
        pageCount: info.pageCount,
        pageSizes: info.pageSizes,
      });
      onCreated(source.id);
    } catch {
      setError('The PDF could not be saved. Browser storage may be full.');
    }
  };

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await upload(file);
    } finally {
      setBusy(false);
      // Lets the same file be picked again after an error.
      input.value = '';
    }
  };

  return (
    <div className={styles.upload}>
      <label className="field-label" htmlFor="upload-source">
        Upload a PDF (up to 3 MB)
      </label>
      <input
        id="upload-source"
        className="input"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Upload a PDF"
        disabled={busy}
        onChange={(event) => void handleChange(event)}
      />
      {busy && <p className={styles.status}>Reading the PDF…</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
