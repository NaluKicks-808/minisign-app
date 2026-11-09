/** Contract (PRD §7): the bouncer. Lane A implements. Every command guards, then saves change + event together. */
import type { Repository } from '../data/repository';
import { NotImplemented } from '../domain/errors';
import type {
  Document,
  DocumentBundle,
  DocumentId,
  Field,
  FieldId,
  FieldPatch,
  FieldValueContent,
  RecipientInput,
  SourceDocument,
  SourceDocumentId,
  UserId,
} from '../domain/types';
import type { AuditLog } from './auditLog';

export class DocumentService {
  constructor(
    protected readonly repo: Repository,
    protected readonly audit: AuditLog,
    protected readonly now: () => Date = () => new Date(),
  ) {}

  async createDocument(_actorId: UserId, _sourceDocumentId: SourceDocumentId): Promise<Document> {
    throw new NotImplemented('createDocument');
  }
  async addField(
    _actorId: UserId,
    _docId: DocumentId,
    _draft: Omit<Field, 'id' | 'documentId'>,
  ): Promise<Field> {
    throw new NotImplemented('addField');
  }
  /** A change of type or assignee clears any value already on the field. */
  async updateField(_actorId: UserId, _fieldId: FieldId, _patch: FieldPatch): Promise<Field> {
    throw new NotImplemented('updateField');
  }
  async removeField(_actorId: UserId, _fieldId: FieldId): Promise<void> {
    throw new NotImplemented('removeField');
  }
  /** Stores even an invalid value (errors show inline). null or '' clears it. */
  async setValue(
    _actorId: UserId,
    _fieldId: FieldId,
    _value: FieldValueContent | null,
  ): Promise<void> {
    throw new NotImplemented('setValue');
  }
  async setRecipient(_actorId: UserId, _docId: DocumentId, _r: RecipientInput): Promise<void> {
    throw new NotImplemented('setRecipient');
  }
  async send(_actorId: UserId, _docId: DocumentId): Promise<void> {
    throw new NotImplemented('send');
  }
  /** First open by the recipient while sent; idempotent. */
  async markViewed(_actorId: UserId, _docId: DocumentId): Promise<void> {
    throw new NotImplemented('markViewed');
  }
  async finish(_actorId: UserId, _docId: DocumentId): Promise<void> {
    throw new NotImplemented('finish');
  }
  async listDocumentsFor(_userId: UserId): Promise<Document[]> {
    throw new NotImplemented('listDocumentsFor');
  }
  /** Throws NotVisibleError when the user may not see it. */
  async getDocumentFor(_docId: DocumentId, _userId: UserId): Promise<DocumentBundle> {
    throw new NotImplemented('getDocumentFor');
  }
  /** Upload path: the only write to source documents. */
  async addSourceDocument(_actorId: UserId, _source: Omit<SourceDocument, 'id'>): Promise<SourceDocument> {
    throw new NotImplemented('addSourceDocument');
  }
  async listUsers() {
    return this.repo.listUsers();
  }
  async listSourceDocuments() {
    return this.repo.listSourceDocuments();
  }
  async getSourceDocument(id: SourceDocumentId) {
    return this.repo.getSourceDocument(id);
  }
  /** Reset demo data: clear storage and re-seed. */
  async resetDemo(): Promise<void> {
    await this.repo.reset();
  }
}
