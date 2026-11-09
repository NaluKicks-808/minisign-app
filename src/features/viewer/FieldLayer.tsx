import type { ReactNode } from 'react';
import type { Field } from '../../domain/types';

/** Contract. Lane B: places each field of `page` by percent rect and renders renderField inside. */
export function FieldLayer(_props: { page: number; renderField: (field: Field) => ReactNode }) {
  return null;
}
