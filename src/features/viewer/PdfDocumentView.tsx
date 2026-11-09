import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Document, pdfjs } from 'react-pdf';
import { useAppStore } from '../../store/useAppStore';
import { PageSurface } from './PageSurface';
import styles from './PdfDocumentView.module.css';

// Must sit in a module that imports react-pdf itself, or react-pdf's default overwrites it.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** Keeps a page readable on a very wide window. */
const MAX_PAGE_WIDTH = 1040;

/** Renders every page of the active bundle's source as a PageSurface. */
export function PdfDocumentView({ renderOverlay }: { renderOverlay?: (page: number) => ReactNode }) {
  const source = useAppStore((s) => s.activeBundle?.source);

  const columnRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumnWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.min(columnWidth, MAX_PAGE_WIDTH);

  return (
    <div ref={columnRef} className={styles.column}>
      {source && pageWidth > 0 && (
        <Document
          key={source.id}
          file={source.fileUrl}
          className={styles.pages}
          suspense={false}
          loading={<p className={styles.message}>Opening the document…</p>}
          error={<p className={`${styles.message} error-text`}>This PDF could not be opened.</p>}
        >
          {Array.from({ length: source.pageCount }, (_, index) => index + 1).map((page) => (
            <PageSurface key={page} page={page} width={pageWidth}>
              {renderOverlay?.(page)}
            </PageSurface>
          ))}
        </Document>
      )}
    </div>
  );
}
