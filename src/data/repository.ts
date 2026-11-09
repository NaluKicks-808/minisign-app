/** Contract (PRD §7). All async, all return copies. No method edits or removes an event. */
import type {
  AuditEvent,
  Document,
  DocumentBundle,
  DocumentId,
  Field,
  FieldId,
  FieldValue,
  SourceDocument,
  SourceDocumentId,
  User,
  UserId,
} from '../domain/types';

/** One atomic save. Events are append-only. */
export interface BundleChange {
  document: Document;
  upsertFields?: Field[];
  removeFieldIds?: FieldId[];
  upsertValues?: FieldValue[];
  removeValueFieldIds?: FieldId[];
  appendEvents?: AuditEvent[];
}

export interface Repository {
  listUsers(): Promise<User[]>;
  getUser(id: UserId): Promise<User | null>;
  upsertUser(u: User): Promise<void>;
  listSourceDocuments(): Promise<SourceDocument[]>;
  getSourceDocument(id: SourceDocumentId): Promise<SourceDocument | null>;
  addSourceDocument(s: SourceDocument): Promise<void>;
  /** Raw filter: sender or recipient. The service applies visibility rules. */
  listDocumentsForUser(userId: UserId): Promise<Document[]>;
  getDocumentBundle(id: DocumentId): Promise<DocumentBundle | null>;
  /** The document a field belongs to, so field commands can load its bundle. */
  findDocumentIdByField(fieldId: FieldId): Promise<DocumentId | null>;
  saveDocumentBundle(change: BundleChange): Promise<void>;
  reset(): Promise<void>;
}

/** The whole store: localStorage key `minisign:v1` holds exactly this JSON. */
export interface StoredState {
  users: User[];
  sourceDocuments: SourceDocument[];
  documents: Document[];
  fields: Field[];
  values: FieldValue[];
  events: AuditEvent[];
}

export const STORAGE_KEY = 'minisign:v1';
export const SESSION_KEY = 'minisign:session';
