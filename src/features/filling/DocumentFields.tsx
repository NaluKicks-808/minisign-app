import type { Field } from '../../domain/types';
import { FieldLayer } from '../viewer/FieldLayer';
import { PdfDocumentView } from '../viewer/PdfDocumentView';
import { FieldInput } from './FieldInput';

const renderField = (field: Field) => <FieldInput field={field} />;
const renderOverlay = (page: number) => <FieldLayer page={page} renderField={renderField} />;

/** The pages with their fields in Fill, signing or read-only presentation. */
export function DocumentFields() {
  return <PdfDocumentView renderOverlay={renderOverlay} />;
}
