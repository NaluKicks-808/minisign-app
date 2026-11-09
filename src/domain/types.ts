/** Contract (PRD §3). Frozen before lanes start: request changes through the lead. */
export type UserId = string;
export type SourceDocumentId = string;
export type DocumentId = string;
export type FieldId = string;
export type AuditEventId = string;

export interface User {
  id: UserId;
  name: string;
  email: string;
}

/** The blank, never-modified PDF. */
export interface SourceDocument {
  id: SourceDocumentId;
  title: string;
  fileUrl: string; // static path, or data: URL for uploads
  pageCount: number;
  pageSizes: { widthPt: number; heightPt: number }[]; // index 0 = page 1
}

export type DocumentStatus = 'draft' | 'sent' | 'completed';

/** One copy of a source document being sent to one recipient (an "envelope"). */
export interface Document {
  id: DocumentId;
  sourceDocumentId: SourceDocumentId;
  title: string;
  senderId: UserId;
  recipientId: UserId | null; // null until a recipient is chosen
  status: DocumentStatus;
  createdAt: string; // ISO
  sentAt: string | null;
  completedAt: string | null;
}

export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';
export type Assignee = 'sender' | 'recipient';

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
} // all 0..1, origin top-left

/** The layout: one placed box. Never holds a value. */
export interface Field {
  id: FieldId;
  documentId: DocumentId;
  type: FieldType;
  label: string;
  required: boolean;
  assignee: Assignee;
  page: number; // 1-based
  rect: NormalizedRect;
  autoFillSigningDate: boolean; // meaningful only for type 'date'
  origin: 'manual' | 'autoprep';
}

export type SignatureValue =
  | { kind: 'typed'; text: string }
  | { kind: 'drawn'; pngDataUrl: string };

export type FieldValueContent = string | SignatureValue;

/** What was filled in. Primary key = fieldId (a field has at most one value). */
export interface FieldValue {
  fieldId: FieldId;
  documentId: DocumentId;
  value: FieldValueContent;
  filledBy: UserId;
  filledAt: string;
}

export type AuditEventType =
  | 'document.created'
  | 'field.added'
  | 'field.updated'
  | 'field.removed'
  | 'value.set' // not in the PRD §3 list; §8 requires an event for every §7 command
  | 'recipient.set' // same reason
  | 'autoprep.suggested'
  | 'autoprep.accepted'
  | 'autoprep.rejected'
  | 'document.sent'
  | 'document.viewed'
  | 'document.completed';

/** Append-only, hash-chained (PRD §8). */
export interface AuditEvent {
  id: AuditEventId;
  documentId: DocumentId;
  seq: number; // 1..n per document
  actorId: UserId;
  type: AuditEventType;
  at: string;
  data: Record<string, unknown>;
  prevHash: string; // '0'.repeat(64) for seq 1
  hash: string; // SHA-256 hex
}

export interface DocumentBundle {
  document: Document;
  fields: Field[];
  values: FieldValue[];
  events: AuditEvent[];
}

export type FieldPatch = Partial<
  Pick<Field, 'type' | 'label' | 'required' | 'assignee' | 'page' | 'rect' | 'autoFillSigningDate'>
>;

export type RecipientInput = { userId: UserId } | { name?: string; email: string };

export type VerifyResult = { ok: true } | { ok: false; brokenAtSeq: number };
export type GuardResult = { ok: true } | { ok: false; reasons: string[] };

/** One blocking problem on one field, for inline errors and the summary list. */
export interface FieldIssue {
  fieldId: FieldId;
  label: string;
  message: string;
}
