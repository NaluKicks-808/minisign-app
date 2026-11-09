/** Composition root: the only place concrete classes are wired. Lead finishes this at integration. */
import { createLocalStorageRepository } from '../data/localStorageRepository';
import { AuditLog } from './auditLog';
import { AutoPrepService } from './autoPrepService';
import { DocumentService } from './documentService';
import type { FieldDetector, PageContentExtractor } from '../domain/autoprep';
import { createCompositeDetector } from '../features/autoprep/detectors';
import { pdfjsPageContentExtractor } from '../features/autoprep/pageContent/pdfjsPageContent';

function build() {
  const repo = createLocalStorageRepository();
  const audit = new AuditLog(repo);
  const documents = new DocumentService(repo, audit);
  const extractor: PageContentExtractor = pdfjsPageContentExtractor;
  const detector: FieldDetector = createCompositeDetector();
  const autoPrep = new AutoPrepService({ repo, audit, documents, extractor, detector });
  return { repo, audit, documents, autoPrep };
}

export type Container = ReturnType<typeof build>;
let instance: Container | null = null;
export function container(): Container {
  instance ??= build();
  return instance;
}
