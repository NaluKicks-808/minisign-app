/** Contract (PRD §10.2). Lane D implements. */
import type { Repository } from '../data/repository';
import type { FieldDetector, FieldSuggestion, PageContentExtractor } from '../domain/autoprep';
import { NotImplemented } from '../domain/errors';
import type { DocumentId, UserId } from '../domain/types';
import type { AuditLog } from './auditLog';
import type { DocumentService } from './documentService';

export interface AutoPrepDeps {
  repo: Repository;
  audit: AuditLog;
  documents: DocumentService;
  extractor: PageContentExtractor;
  detector: FieldDetector;
}

export class AutoPrepService {
  constructor(protected readonly deps: AutoPrepDeps) {}

  async suggest(_actorId: UserId, _docId: DocumentId): Promise<FieldSuggestion[]> {
    throw new NotImplemented('AutoPrepService.suggest');
  }
  async accept(_actorId: UserId, _docId: DocumentId, _s: FieldSuggestion[]): Promise<void> {
    throw new NotImplemented('AutoPrepService.accept');
  }
  async reject(_actorId: UserId, _docId: DocumentId, _count: number): Promise<void> {
    throw new NotImplemented('AutoPrepService.reject');
  }
}
