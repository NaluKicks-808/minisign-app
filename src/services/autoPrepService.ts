/** Contract (PRD §10.2). Suggestions are UI state: only the audit events are persisted here. */
import type { Repository } from '../data/repository';
import type { FieldDetector, FieldSuggestion, PageContentExtractor } from '../domain/autoprep';
import { GuardError, NotFoundError } from '../domain/errors';
import { iou } from '../domain/geometry';
import { canEditLayout } from '../domain/permissions';
import type { DocumentBundle, DocumentId, UserId } from '../domain/types';
import type { AuditLog } from './auditLog';
import type { DocumentService } from './documentService';

const OVERLAP_IOU = 0.5;

export interface AutoPrepDeps {
  repo: Repository;
  audit: AuditLog;
  documents: DocumentService;
  extractor: PageContentExtractor;
  detector: FieldDetector;
}

export class AutoPrepService {
  constructor(protected readonly deps: AutoPrepDeps) {}

  /** Loads the document and refuses anyone who may not edit its layout. */
  private async guarded(actorId: UserId, docId: DocumentId): Promise<DocumentBundle> {
    const bundle = await this.deps.repo.getDocumentBundle(docId);
    if (!bundle) throw new NotFoundError('Document');
    if (!canEditLayout(bundle.document, actorId)) {
      throw new GuardError(['Only the sender can prepare a draft document.']);
    }
    return bundle;
  }

  async suggest(actorId: UserId, docId: DocumentId): Promise<FieldSuggestion[]> {
    const { document, fields } = await this.guarded(actorId, docId);
    const source = await this.deps.repo.getSourceDocument(document.sourceDocumentId);
    if (!source) throw new NotFoundError('Source document');
    const pages = await this.deps.extractor.extract(source);
    const suggestions = this.deps.detector
      .detect(pages)
      .filter(
        (s) => !fields.some((f) => f.page === s.page && iou(f.rect, s.rect) > OVERLAP_IOU),
      );
    await this.deps.audit.append(docId, actorId, 'autoprep.suggested', {
      count: suggestions.length,
    });
    return suggestions;
  }

  async accept(actorId: UserId, docId: DocumentId, suggestions: FieldSuggestion[]): Promise<void> {
    await this.guarded(actorId, docId);
    for (const s of suggestions) {
      await this.deps.documents.addField(actorId, docId, {
        type: s.type,
        label: s.label,
        required: s.required,
        assignee: s.assignee,
        page: s.page,
        rect: s.rect,
        autoFillSigningDate: s.autoFillSigningDate,
        origin: 'autoprep',
      });
    }
    await this.deps.audit.append(docId, actorId, 'autoprep.accepted', {
      count: suggestions.length,
    });
  }

  async reject(actorId: UserId, docId: DocumentId, count: number): Promise<void> {
    await this.guarded(actorId, docId);
    await this.deps.audit.append(docId, actorId, 'autoprep.rejected', { count });
  }
}
