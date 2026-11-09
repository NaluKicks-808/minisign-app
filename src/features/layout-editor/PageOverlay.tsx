import type { MouseEvent } from 'react';
import { toNormalized } from '../../domain/geometry';
import type { Field } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { SuggestionLayer } from '../autoprep/SuggestionLayer';
import { FieldLayer } from '../viewer/FieldLayer';
import { FieldBox } from './FieldBox';
import { newFieldDraft } from './fieldDefaults';
import styles from './PageOverlay.module.css';

const renderFieldBox = (field: Field) => <FieldBox field={field} />;

/** What lies over one page in Layout mode. A click here drops the armed field or clears the selection. */
export function PageOverlay({ page }: { page: number }) {
  const placingType = useAppStore((s) => s.placingType);
  const setPlacingType = useAppStore((s) => s.setPlacingType);
  const addField = useAppStore((s) => s.addField);
  const selectField = useAppStore((s) => s.selectField);
  const selectSuggestion = useAppStore((s) => s.selectSuggestion);

  const onClick = async (event: MouseEvent<HTMLDivElement>) => {
    if (placingType) {
      const at = toNormalized(
        { x: event.clientX, y: event.clientY },
        event.currentTarget.getBoundingClientRect(),
      );
      setPlacingType(null);
      const field = await addField(newFieldDraft(placingType, page, at));
      if (field) selectField(field.id);
      return;
    }
    const onBox = (event.target as Element).closest(
      '[data-testid="field-box"], [data-testid="suggestion-box"]',
    );
    if (!onBox) {
      selectField(null);
      selectSuggestion(null);
    }
  };

  return (
    <div className={styles.overlay} data-placing={placingType !== null} onClick={onClick}>
      <FieldLayer page={page} renderField={renderFieldBox} />
      <SuggestionLayer page={page} />
    </div>
  );
}
