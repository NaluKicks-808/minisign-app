import { useState, type ReactNode } from 'react';
import { rectToStyle } from '../../domain/geometry';
import type { Field } from '../../domain/types';
import { selectFields } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { FieldPreviewContext, type FieldPreview } from './fieldPreview';
import styles from './FieldLayer.module.css';

/** Places each field of `page` by percent rect and renders renderField inside. */
export function FieldLayer({
  page,
  renderField,
}: {
  page: number;
  renderField: (field: Field) => ReactNode;
}) {
  const fields = useAppStore(selectFields);
  const [preview, setPreview] = useState<FieldPreview | null>(null);

  return (
    <FieldPreviewContext value={setPreview}>
      <div className={styles.layer}>
        {fields
          .filter((field) => field.page === page)
          .map((field) => (
            <div
              key={field.id}
              className={styles.box}
              style={rectToStyle(preview?.id === field.id ? preview.rect : field.rect)}
              data-testid="field-box"
              data-field-id={field.id}
              data-field-label={field.label}
              data-field-type={field.type}
              data-assignee={field.assignee}
              data-origin={field.origin}
            >
              <span className={styles.flag}>
                <span className={styles.flagText}>{field.label}</span>
                {field.required && <span>*</span>}
              </span>
              <span className={styles.marker} aria-hidden="true">
                {field.required ? '*' : ''}
              </span>
              <div className={styles.content}>{renderField(field)}</div>
            </div>
          ))}
      </div>
    </FieldPreviewContext>
  );
}
