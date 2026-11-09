import type { Document, DocumentBundle, SourceDocument, User } from '../domain/types';
import { applyBundleChange, bundleFrom, seededState } from './memoryRepository';
import type { BundleChange, Repository, StoredState } from './repository';
import { STORAGE_KEY } from './repository';

function read(): StoredState {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? seededState() : (JSON.parse(raw) as StoredState);
}

function write(state: StoredState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Read-modify-write with a single setItem, which makes every save atomic for one tab. */
function update(change: (state: StoredState) => void): void {
  const state = read();
  change(state);
  write(state);
}

/** One JSON object under STORAGE_KEY, seeded on first use. Every read parses a fresh copy. */
export function createLocalStorageRepository(): Repository {
  if (localStorage.getItem(STORAGE_KEY) === null) write(seededState());

  return {
    async listUsers(): Promise<User[]> {
      return read().users;
    },
    async getUser(id) {
      return read().users.find((u) => u.id === id) ?? null;
    },
    async upsertUser(user) {
      update((state) => {
        const i = state.users.findIndex((u) => u.id === user.id);
        if (i >= 0) state.users[i] = user;
        else state.users.push(user);
      });
    },
    async listSourceDocuments(): Promise<SourceDocument[]> {
      return read().sourceDocuments;
    },
    async getSourceDocument(id) {
      return read().sourceDocuments.find((s) => s.id === id) ?? null;
    },
    async addSourceDocument(source) {
      update((state) => state.sourceDocuments.push(source));
    },
    async listDocumentsForUser(userId): Promise<Document[]> {
      return read().documents.filter((d) => d.senderId === userId || d.recipientId === userId);
    },
    async getDocumentBundle(id): Promise<DocumentBundle | null> {
      return bundleFrom(read(), id);
    },
    async findDocumentIdByField(fieldId) {
      return read().fields.find((f) => f.id === fieldId)?.documentId ?? null;
    },
    async saveDocumentBundle(change: BundleChange) {
      update((state) => applyBundleChange(state, change));
    },
    async reset() {
      write(seededState());
    },
  };
}
