import type { FieldDetector } from '../../../domain/autoprep';
import { NotImplemented } from '../../../domain/errors';

/** Lane D implements: RuledCellDetector + LabelGapDetector, de-duplicated by IoU. */
export function createCompositeDetector(): FieldDetector {
  return {
    name: 'composite',
    detect() {
      throw new NotImplemented('createCompositeDetector');
    },
  };
}
