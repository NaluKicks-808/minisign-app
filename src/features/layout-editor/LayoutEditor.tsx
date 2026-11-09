import { useAppStore } from '../../store/useAppStore';
import { AutoPrepButton } from '../autoprep/AutoPrepButton';
import { SuggestionInspector } from '../autoprep/SuggestionLayer';
import { PdfDocumentView } from '../viewer/PdfDocumentView';
import { FieldInspector } from './FieldInspector';
import { FieldPalette } from './FieldPalette';
import { PageOverlay } from './PageOverlay';
import { useLayoutKeyboard } from './useLayoutKeyboard';
import styles from './LayoutEditor.module.css';

const renderOverlay = (page: number) => <PageOverlay page={page} />;

/** Layout mode: the pages on the desk, tools in the panel on the right. */
export function LayoutEditor() {
  useLayoutKeyboard();
  const suggestionSelected = useAppStore((s) => s.selectedSuggestionKey !== null);

  return (
    <div className={styles.editor}>
      <PdfDocumentView renderOverlay={renderOverlay} />
      <aside className={`panel ${styles.side}`}>
        {suggestionSelected && <SuggestionInspector />}
        <AutoPrepButton />
        <FieldPalette />
        {!suggestionSelected && <FieldInspector />}
      </aside>
    </div>
  );
}
