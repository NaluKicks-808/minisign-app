/** Contract (PRD §7). UI state + a cache of the repository, never the truth. */
import { create } from 'zustand';
import { GuardError, NotFoundError, NotVisibleError } from '../domain/errors';
import type { FieldSuggestion } from '../domain/autoprep';
import { SESSION_KEY } from '../data/repository';
import { container } from '../services/container';
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
  User,
  UserId,
  VerifyResult,
} from '../domain/types';

export interface ActiveBundle extends DocumentBundle {
  source: SourceDocument;
  integrity: VerifyResult;
}

/** A suggestion in the UI, before it is accepted. Never persisted. */
export interface PendingSuggestion extends FieldSuggestion {
  key: string;
}

export type EditorMode = 'layout' | 'fill';
export type ModalState = { kind: 'signature'; fieldId: FieldId } | null;

export interface AppState {
  ready: boolean;
  currentUserId: UserId;
  users: User[];
  sourceDocuments: SourceDocument[];
  documentsList: Document[];
  activeBundle: ActiveBundle | null;
  selectedFieldId: FieldId | null;
  editorMode: EditorMode;
  /** Field the palette will drop on the next page click. */
  placingType: Field['type'] | null;
  suggestions: PendingSuggestion[];
  selectedSuggestionKey: string | null;
  modal: ModalState;
  /** Last command failure, shown as a dismissable message. */
  error: string | null;

  init(): Promise<void>;
  switchUser(id: UserId): Promise<void>;
  resetDemo(): Promise<void>;
  refreshList(): Promise<void>;
  openDocument(id: DocumentId): Promise<void>;
  closeDocument(): void;
  refreshActive(): Promise<void>;
  createDocument(sourceId: SourceDocumentId): Promise<Document>;
  addSourceDocument(source: Omit<SourceDocument, 'id'>): Promise<SourceDocument>;

  addField(draft: Omit<Field, 'id' | 'documentId'>): Promise<Field | null>;
  updateField(fieldId: FieldId, patch: FieldPatch): Promise<void>;
  removeField(fieldId: FieldId): Promise<void>;
  setValue(fieldId: FieldId, value: FieldValueContent | null): Promise<void>;
  setRecipient(r: RecipientInput): Promise<void>;
  send(): Promise<boolean>;
  finish(): Promise<boolean>;

  runAutoPrep(): Promise<void>;
  updateSuggestion(key: string, patch: Partial<FieldSuggestion>): void;
  acceptSuggestions(keys: string[]): Promise<void>;
  rejectSuggestions(keys: string[]): Promise<void>;

  selectField(id: FieldId | null): void;
  selectSuggestion(key: string | null): void;
  setEditorMode(mode: EditorMode): void;
  setPlacingType(type: Field['type'] | null): void;
  openSignatureModal(fieldId: FieldId): void;
  closeModal(): void;
  clearError(): void;
}

const DEFAULT_USER_ID = 'u_dana';

function messageOf(e: unknown): string {
  if (e instanceof GuardError) return e.reasons.join(' ');
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

function readSessionUser(): UserId | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionUser(id: UserId): void {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    // A blocked localStorage costs only the remembered user.
  }
}

/** Everything that belongs to one open document. Cleared whenever it closes. */
const CLOSED_DOCUMENT = {
  activeBundle: null,
  selectedFieldId: null,
  editorMode: 'layout',
  placingType: null,
  suggestions: [],
  selectedSuggestionKey: null,
  modal: null,
} satisfies Partial<AppState>;

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export const useAppStore = create<AppState>()((set, get) => {
  /*
   * Every read-then-write runs through one queue. The audit chain hashes with
   * async Web Crypto, so a blur commit and the Send click that caused it would
   * otherwise interleave and fork the chain.
   */
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = tail.then(job);
    tail = run.catch(() => undefined);
    return run;
  }

  /** Bumped on every open and close, so a slow read cannot land on a newer screen. */
  let session = 0;
  let activeId: DocumentId | null = null;
  let initializing: Promise<void> | null = null;
  let suggestionCounter = 0;

  async function loadBundle(id: DocumentId, userId: UserId): Promise<ActiveBundle> {
    const { documents, audit } = container();
    const bundle = await documents.getDocumentFor(id, userId);
    const [source, integrity] = await Promise.all([
      documents.getSourceDocument(bundle.document.sourceDocumentId),
      audit.verify(id),
    ]);
    if (!source) throw new NotFoundError('The source PDF for this document');
    return { ...bundle, source, integrity };
  }

  async function reloadList(): Promise<void> {
    const userId = get().currentUserId;
    const list = await container().documents.listDocumentsFor(userId);
    if (get().currentUserId === userId) set({ documentsList: list });
  }

  async function reloadActive(): Promise<void> {
    const id = activeId;
    if (!id) return;
    const opened = session;
    const bundle = await loadBundle(id, get().currentUserId);
    if (opened === session) set({ activeBundle: bundle });
  }

  /** Re-reads after a command. A failed re-read reports; it never throws. */
  async function reloadAll(): Promise<void> {
    try {
      await Promise.all([reloadActive(), reloadList()]);
    } catch (e) {
      set({ error: messageOf(e) });
    }
  }

  function command<T>(run: () => Promise<T>): Promise<Outcome<T>> {
    return enqueue(async () => {
      let outcome: Outcome<T>;
      try {
        outcome = { ok: true, value: await run() };
      } catch (e) {
        set({ error: messageOf(e) });
        outcome = { ok: false, error: e };
      }
      await reloadAll();
      return outcome;
    });
  }

  /** Runs a command against the open document. */
  function onActive<T>(run: (docId: DocumentId, actorId: UserId) => Promise<T>) {
    // Captured now: by the time the queue reaches this, the screen may have moved on.
    const docId = activeId;
    const actorId = get().currentUserId;
    return command(async () => {
      if (!docId) throw new Error('No document is open.');
      return run(docId, actorId);
    });
  }

  /** Runs a command as whoever is acting at the moment it was asked for. */
  function asActor<T>(run: (actorId: UserId) => Promise<T>) {
    const actorId = get().currentUserId;
    return command(() => run(actorId));
  }

  function unwrap<T>(outcome: Outcome<T>): T {
    if (outcome.ok) return outcome.value;
    throw outcome.error;
  }

  async function reloadCatalog(): Promise<void> {
    const { documents } = container();
    const [users, sourceDocuments] = await Promise.all([
      documents.listUsers(),
      documents.listSourceDocuments(),
    ]);
    set({ users, sourceDocuments });
  }

  function pickUser(users: User[], wanted: UserId | null): UserId {
    if (wanted && users.some((u) => u.id === wanted)) return wanted;
    return users[0]?.id ?? DEFAULT_USER_ID;
  }

  function closeActive(): void {
    session += 1;
    activeId = null;
    set(CLOSED_DOCUMENT);
  }

  return {
    ready: false,
    currentUserId: DEFAULT_USER_ID,
    users: [],
    sourceDocuments: [],
    documentsList: [],
    activeBundle: null,
    selectedFieldId: null,
    editorMode: 'layout',
    placingType: null,
    suggestions: [],
    selectedSuggestionKey: null,
    modal: null,
    error: null,

    init() {
      initializing ??= enqueue(async () => {
        try {
          await reloadCatalog();
          const currentUserId = pickUser(get().users, readSessionUser());
          set({ currentUserId });
          writeSessionUser(currentUserId);
          await reloadList();
        } catch (e) {
          set({ error: messageOf(e) });
        } finally {
          set({ ready: true });
        }
      });
      return initializing;
    },

    async switchUser(id) {
      if (!get().users.some((u) => u.id === id)) return;
      closeActive();
      writeSessionUser(id);
      set({ currentUserId: id, documentsList: [] });
      await enqueue(reloadAll);
    },

    async resetDemo() {
      closeActive();
      await command(async () => {
        await container().documents.resetDemo();
        await reloadCatalog();
        const currentUserId = pickUser(get().users, get().currentUserId);
        writeSessionUser(currentUserId);
        set({ currentUserId, documentsList: [] });
      });
    },

    async refreshList() {
      await enqueue(reloadAll);
    },

    async openDocument(id) {
      session += 1;
      const opened = session;
      activeId = id;
      set(CLOSED_DOCUMENT);
      await enqueue(async () => {
        if (opened !== session) return;
        const userId = get().currentUserId;
        try {
          let bundle = await loadBundle(id, userId);
          const { status, recipientId } = bundle.document;
          if (status === 'sent' && recipientId === userId) {
            await container().documents.markViewed(userId, id);
            bundle = await loadBundle(id, userId);
          }
          if (opened === session) set({ activeBundle: bundle });
        } catch (e) {
          // The document screen explains an unavailable document itself.
          if (!(e instanceof NotVisibleError || e instanceof NotFoundError)) {
            set({ error: messageOf(e) });
          }
        }
      });
    },

    closeDocument() {
      closeActive();
    },

    async refreshActive() {
      await enqueue(async () => {
        try {
          await reloadActive();
        } catch (e) {
          set({ error: messageOf(e) });
        }
      });
    },

    async createDocument(sourceId) {
      return unwrap(
        await asActor((actorId) => container().documents.createDocument(actorId, sourceId)),
      );
    },

    async addSourceDocument(source) {
      return unwrap(
        await asActor(async (actorId) => {
          const created = await container().documents.addSourceDocument(actorId, source);
          await reloadCatalog();
          return created;
        }),
      );
    },

    async addField(draft) {
      const outcome = await onActive((docId, actorId) =>
        container().documents.addField(actorId, docId, draft),
      );
      return outcome.ok ? outcome.value : null;
    },

    async updateField(fieldId, patch) {
      await asActor((actorId) => container().documents.updateField(actorId, fieldId, patch));
    },

    async removeField(fieldId) {
      const outcome = await asActor((actorId) =>
        container().documents.removeField(actorId, fieldId),
      );
      if (outcome.ok && get().selectedFieldId === fieldId) set({ selectedFieldId: null });
    },

    async setValue(fieldId, value) {
      await asActor((actorId) => container().documents.setValue(actorId, fieldId, value));
    },

    async setRecipient(r) {
      await onActive(async (docId, actorId) => {
        await container().documents.setRecipient(actorId, docId, r);
        // A new email creates a user, who must be nameable right away.
        await reloadCatalog();
      });
    },

    async send() {
      const outcome = await onActive((docId, actorId) =>
        container().documents.send(actorId, docId),
      );
      return outcome.ok;
    },

    async finish() {
      const outcome = await onActive((docId, actorId) =>
        container().documents.finish(actorId, docId),
      );
      return outcome.ok;
    },

    async runAutoPrep() {
      const opened = session;
      await onActive(async (docId, actorId) => {
        const found = await container().autoPrep.suggest(actorId, docId);
        if (opened !== session) return;
        const suggestions = found.map((s) => ({
          ...s,
          key: `sug_${(suggestionCounter += 1)}`,
        }));
        set({ suggestions, selectedSuggestionKey: null });
      });
    },

    updateSuggestion(key, patch) {
      set({
        suggestions: get().suggestions.map((s) => (s.key === key ? { ...s, ...patch } : s)),
      });
    },

    async acceptSuggestions(keys) {
      await onActive(async (docId, actorId) => {
        // Read here, so edits made while the queue was busy are the ones accepted.
        const chosen = get().suggestions.filter((s) => keys.includes(s.key));
        if (chosen.length === 0) return;
        await container().autoPrep.accept(
          actorId,
          docId,
          chosen.map(({ key: _key, ...suggestion }) => suggestion),
        );
        dropSuggestions(chosen.map((s) => s.key));
      });
    },

    async rejectSuggestions(keys) {
      await onActive(async (docId, actorId) => {
        const chosen = get().suggestions.filter((s) => keys.includes(s.key));
        if (chosen.length === 0) return;
        await container().autoPrep.reject(actorId, docId, chosen.length);
        dropSuggestions(chosen.map((s) => s.key));
      });
    },

    selectField(id) {
      set({ selectedFieldId: id });
    },
    selectSuggestion(key) {
      set({ selectedSuggestionKey: key });
    },
    setEditorMode(mode) {
      set({ editorMode: mode, placingType: null, selectedFieldId: null });
    },
    setPlacingType(type) {
      set({ placingType: type });
    },
    openSignatureModal(fieldId) {
      set({ modal: { kind: 'signature', fieldId } });
    },
    closeModal() {
      set({ modal: null });
    },
    clearError() {
      set({ error: null });
    },
  };

  function dropSuggestions(keys: string[]): void {
    const { suggestions, selectedSuggestionKey } = get();
    set({
      suggestions: suggestions.filter((s) => !keys.includes(s.key)),
      selectedSuggestionKey:
        selectedSuggestionKey && keys.includes(selectedSuggestionKey)
          ? null
          : selectedSuggestionKey,
    });
  }
});
