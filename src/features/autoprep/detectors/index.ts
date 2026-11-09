import type { FieldDetector, FieldSuggestion, PageContent } from '../../../domain/autoprep';
import { iou } from '../../../domain/geometry';
import { LabelGapDetector } from './labelGapDetector';
import { RuledCellDetector } from './ruledCellDetector';

const DUPLICATE_IOU = 0.5;

/** Runs every detector and keeps the most confident of any overlapping pair. */
export function CompositeDetector(detectors: FieldDetector[]): FieldDetector {
  return {
    name: 'composite',
    detect(pages: PageContent[]): FieldSuggestion[] {
      const kept: FieldSuggestion[] = [];
      const byConfidence = detectors
        .flatMap((detector) => detector.detect(pages))
        .sort((a, b) => b.confidence - a.confidence);
      for (const suggestion of byConfidence) {
        const duplicate = kept.some(
          (other) => other.page === suggestion.page && iou(other.rect, suggestion.rect) > DUPLICATE_IOU,
        );
        if (!duplicate) kept.push(suggestion);
      }
      return kept.sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    },
  };
}

export function createCompositeDetector(): FieldDetector {
  return CompositeDetector([RuledCellDetector, LabelGapDetector]);
}

export { LabelGapDetector, RuledCellDetector };
