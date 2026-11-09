import type { PageContentExtractor } from '../../../domain/autoprep';
import { NotImplemented } from '../../../domain/errors';

/** Lane D implements: the only code that touches pdf.js for extraction. */
export const pdfjsPageContentExtractor: PageContentExtractor = {
  async extract() {
    throw new NotImplemented('pdfjsPageContentExtractor');
  },
};
