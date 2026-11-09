import { useEffect, useState, type ReactNode } from 'react';
import { Page } from 'react-pdf';
import { useAppStore } from '../../store/useAppStore';
import styles from './PageSurface.module.css';

/** How long the width must hold still before the page is redrawn at the new size. */
const REDRAW_SETTLE_MS = 140;

/** A position:relative container exactly the size of the rendered page. */
export function PageSurface({
  page,
  width,
  children,
}: {
  page: number;
  width: number;
  children?: ReactNode;
}) {
  const size = useAppStore((s) => s.activeBundle?.source.pageSizes[page - 1]);

  // While the window moves the existing canvas stretches with CSS, and it is redrawn once settled.
  const [drawnWidth, setDrawnWidth] = useState(width);
  useEffect(() => {
    const timer = setTimeout(() => setDrawnWidth(width), REDRAW_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [width]);

  return (
    <div
      className={styles.surface}
      style={{
        width,
        aspectRatio: size ? `${size.widthPt} / ${size.heightPt}` : undefined,
      }}
      data-testid={`page-surface-${page}`}
    >
      <Page
        pageNumber={page}
        width={drawnWidth}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={null}
      />
      {children}
    </div>
  );
}
