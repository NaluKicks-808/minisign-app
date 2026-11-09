/** Contract (PRD §7). Lane C implements. UI state + a cache of the repository, never the truth. */
import { create } from 'zustand';
import type { FieldSuggestion } from '../domain/autoprep';
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

const todo = (name: string) => () => {
  throw new NotImplemented(name);
};

export const useAppStore = create<AppState>()(() => ({
  ready: false,
  currentUserId: 'u_dana',
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
  init: todo('init'),
  switchUser: todo('switchUser'),
  resetDemo: todo('resetDemo'),
  refreshList: todo('refreshList'),
  openDocument: todo('openDocument'),
  closeDocument: todo('closeDocument'),
  refreshActive: todo('refreshActive'),
  createDocument: todo('createDocument'),
  addSourceDocument: todo('addSourceDocument'),
  addField: todo('addField'),
  updateField: todo('updateField'),
  removeField: todo('removeField'),
  setValue: todo('setValue'),
  setRecipient: todo('setRecipient'),
  send: todo('send'),
  finish: todo('finish'),
  runAutoPrep: todo('runAutoPrep'),
  updateSuggestion: todo('updateSuggestion'),
  acceptSuggestions: todo('acceptSuggestions'),
  rejectSuggestions: todo('rejectSuggestions'),
  selectField: todo('selectField'),
  selectSuggestion: todo('selectSuggestion'),
  setEditorMode: todo('setEditorMode'),
  setPlacingType: todo('setPlacingType'),
  openSignatureModal: todo('openSignatureModal'),
  closeModal: todo('closeModal'),
  clearError: todo('clearError'),
}));
