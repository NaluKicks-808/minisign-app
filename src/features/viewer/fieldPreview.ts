import { createContext, useContext } from 'react';
import type { FieldId, NormalizedRect } from '../../domain/types';

export interface FieldPreview {
  id: FieldId;
  rect: NormalizedRect;
}

/**
 * Where a box is drawn while a gesture is under way. Local to FieldLayer, so a drag touches neither
 * the store nor the repository until release.
 */
export const FieldPreviewContext = createContext<(preview: FieldPreview | null) => void>(() => {});

export const useSetFieldPreview = () => useContext(FieldPreviewContext);
