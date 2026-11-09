/** Contract (PRD §10.2). Pure types: detectors and the service both depend on these. */
import type { Assignee, FieldType, NormalizedRect, SourceDocument } from './types';

/** Everything a detector may look at, already normalized to 0..1 page space. */
export interface PageContent {
  page: number;
  words: { text: string; rect: NormalizedRect; fontSize: number }[];
  rules: { x1: number; y1: number; x2: number; y2: number }[];
  shadedRects: NormalizedRect[];
}

export interface FieldSuggestion {
  page: number;
  rect: NormalizedRect;
  label: string;
  type: FieldType;
  assignee: Assignee;
  required: boolean;
  autoFillSigningDate: boolean;
  confidence: number; // 0..1
  detector: string;
  evidence: string;
}

export interface FieldDetector {
  name: string;
  detect(pages: PageContent[]): FieldSuggestion[];
}

/** The one seam between AutoPrepService and pdf.js. */
export interface PageContentExtractor {
  extract(source: SourceDocument): Promise<PageContent[]>;
}
