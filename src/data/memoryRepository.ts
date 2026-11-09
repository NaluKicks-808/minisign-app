import type { Document, DocumentBundle, SourceDocument, User } from '../domain/types';
import type { BundleChange, Repository, StoredState } from './repository';
import { SEED_SOURCES, SEED_USERS } from './seed';

export function seededState(): StoredState {
  return {
    users: structuredClone(SEED_USERS),
    sourceDocuments: structuredClone(SEED_SOURCES),
    documents: [],
    fields: [],
    values: [],
    events: [],
  };
}

/** Applies one atomic change. Shared with LocalStorageRepository so both behave the same. */
export function applyBundleChange(state: StoredState, change: BundleChange): void {
  const i = state.documents.findIndex((d) => d.id === change.document.id);
  if (i >= 0) state.documents[i] = change.document;
  else state.documents.push(change.document);

  for (const f of change.upsertFields ?? []) {
    const j = state.fields.findIndex((x) => x.id === f.id);
    if (j >= 0) state.fields[j] = f;
    else state.fields.push(f);
  }
  if (change.removeFieldIds?.length) {
    const gone = new Set(change.removeFieldIds);
    state.fields = state.fields.filter((f) => !gone.has(f.id));
    state.values = state.values.filter((v) => !gone.has(v.fieldId));
  }
  for (const v of change.upsertValues ?? []) {
    const j = state.values.findIndex((x) => x.fieldId === v.fieldId);
    if (j >= 0) state.values[j] = v;
    else state.values.push(v);
  }
  if (change.removeValueFieldIds?.length) {
    const gone = new Set(change.removeValueFieldIds);
    state.values = state.values.filter((v) => !gone.has(v.fieldId));
  }
  state.events.push(...(change.appendEvents ?? []));
}

export function bundleFrom(state: StoredState, id: string): DocumentBundle | null {
  const document = state.documents.find((d) => d.id === id);
  if (!document) return null;
  return {
    document,
    fields: state.fields.filter((f) => f.documentId === id),
    values: state.values.filter((v) => v.documentId === id),
    events: state.events.filter((e) => e.documentId === id).sort((a, b) => a.seq - b.seq),
  };
}

/** In-memory Repository for tests. */
export class MemoryRepository implements Repository {
  private state: StoredState = seededState();

  async listUsers(): Promise<User[]> {
    return structuredClone(this.state.users);
  }
  async getUser(id: string): Promise<User | null> {
    return structuredClone(this.state.users.find((u) => u.id === id) ?? null);
  }
  async upsertUser(u: User): Promise<void> {
    const j = this.state.users.findIndex((x) => x.id === u.id);
    if (j >= 0) this.state.users[j] = structuredClone(u);
    else this.state.users.push(structuredClone(u));
  }
  async listSourceDocuments(): Promise<SourceDocument[]> {
    return structuredClone(this.state.sourceDocuments);
  }
  async getSourceDocument(id: string): Promise<SourceDocument | null> {
    return structuredClone(this.state.sourceDocuments.find((s) => s.id === id) ?? null);
  }
  async addSourceDocument(s: SourceDocument): Promise<void> {
    this.state.sourceDocuments.push(structuredClone(s));
  }
  async listDocumentsForUser(userId: string): Promise<Document[]> {
    return structuredClone(
      this.state.documents.filter((d) => d.senderId === userId || d.recipientId === userId),
    );
  }
  async getDocumentBundle(id: string): Promise<DocumentBundle | null> {
    return structuredClone(bundleFrom(this.state, id));
  }
  async findDocumentIdByField(fieldId: string): Promise<string | null> {
    return this.state.fields.find((f) => f.id === fieldId)?.documentId ?? null;
  }
  async saveDocumentBundle(change: BundleChange): Promise<void> {
    applyBundleChange(this.state, structuredClone(change));
  }
  async reset(): Promise<void> {
    this.state = seededState();
  }
}
