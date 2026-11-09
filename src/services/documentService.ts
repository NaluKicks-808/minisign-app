/** Contract (PRD §7): the bouncer. Every command guards, then saves change + event together. */
import type { BundleChange, Repository } from '../data/repository';
import { computeAutofill } from '../domain/autofill';
import { GuardError, NotFoundError, NotVisibleError } from '../domain/errors';
import { canEditLayout, canEditValue, canView } from '../domain/permissions';
import { canTransition } from '../domain/stateMachine';
import type {
  Assignee,
  AuditEventType,
  Document,
  DocumentBundle,
  DocumentId,
  DocumentStatus,
  Field,
  FieldId,
  FieldPatch,
  FieldValueContent,
  RecipientInput,
  SourceDocument,
  SourceDocumentId,
  User,
  UserId,
} from '../domain/types';
import { isAutoFilled, isValidEmail } from '../domain/validation';
import type { AuditLog } from './auditLog';

const LAYOUT_LOCKED = 'Only the sender can change the layout, and only while it is a draft';
const VALUE_LOCKED = 'You cannot edit this field right now';
const RECIPIENT_LOCKED = 'Only the sender can choose the recipient, and only while it is a draft';

type Change = Omit<BundleChange, 'document' | 'appendEvents'> & { document?: Document };

export class DocumentService {
  /** Tail of the write queue. See serialized(). */
  private lastWrite: Promise<unknown> = Promise.resolve();

  constructor(
    protected readonly repo: Repository,
    protected readonly audit: AuditLog,
    protected readonly now: () => Date = () => new Date(),
  ) {}

  async createDocument(actorId: UserId, sourceDocumentId: SourceDocumentId): Promise<Document> {
    return this.serialized(async () => {
      await this.requireUser(actorId);
      const source = await this.repo.getSourceDocument(sourceDocumentId);
      if (!source) throw new NotFoundError('Source document');
      const document: Document = {
        id: `doc_${crypto.randomUUID()}`,
        sourceDocumentId,
        title: source.title,
        senderId: actorId,
        recipientId: null,
        status: 'draft',
        createdAt: this.now().toISOString(),
        sentAt: null,
        completedAt: null,
      };
      await this.commit(
        { document, fields: [], values: [], events: [] },
        actorId,
        'document.created',
        {
          sourceDocumentId,
          title: source.title,
        },
      );
      return document;
    });
  }

  async addField(
    actorId: UserId,
    docId: DocumentId,
    draft: Omit<Field, 'id' | 'documentId'>,
  ): Promise<Field> {
    return this.serialized(async () => {
      const bundle = await this.loadVisible(docId, actorId);
      this.guard(canEditLayout(bundle.document, actorId), LAYOUT_LOCKED);
      const field: Field = { ...draft, id: `fld_${crypto.randomUUID()}`, documentId: docId };
      await this.commit(
        bundle,
        actorId,
        'field.added',
        { fieldId: field.id, label: field.label, type: field.type, assignee: field.assignee },
        { upsertFields: [field] },
      );
      return field;
    });
  }

  /** A change of type or assignee, or turning on auto-fill, clears any value already on the field. */
  async updateField(actorId: UserId, fieldId: FieldId, patch: FieldPatch): Promise<Field> {
    return this.serialized(async () => {
      const { bundle, field } = await this.loadField(actorId, fieldId);
      this.guard(canEditLayout(bundle.document, actorId), LAYOUT_LOCKED);
      const updated: Field = { ...field, ...patch };
      const clearsValue =
        updated.type !== field.type ||
        updated.assignee !== field.assignee ||
        (isAutoFilled(updated) && !isAutoFilled(field));
      await this.commit(
        bundle,
        actorId,
        'field.updated',
        { fieldId, label: updated.label, changed: Object.keys(patch), valueCleared: clearsValue },
        { upsertFields: [updated], removeValueFieldIds: clearsValue ? [fieldId] : [] },
      );
      return updated;
    });
  }

  async removeField(actorId: UserId, fieldId: FieldId): Promise<void> {
    return this.serialized(async () => {
      const { bundle, field } = await this.loadField(actorId, fieldId);
      this.guard(canEditLayout(bundle.document, actorId), LAYOUT_LOCKED);
      await this.commit(
        bundle,
        actorId,
        'field.removed',
        { fieldId, label: field.label },
        { removeFieldIds: [fieldId] },
      );
    });
  }

  /** Stores even an invalid value (errors show inline). null or '' clears it. */
  async setValue(
    actorId: UserId,
    fieldId: FieldId,
    value: FieldValueContent | null,
  ): Promise<void> {
    return this.serialized(async () => {
      const { bundle, field } = await this.loadField(actorId, fieldId);
      this.guard(canEditValue(bundle.document, field, actorId), VALUE_LOCKED);
      const change: Change =
        value === null || value === ''
          ? { removeValueFieldIds: [fieldId] }
          : {
              upsertValues: [
                {
                  fieldId,
                  documentId: field.documentId,
                  value,
                  filledBy: actorId,
                  filledAt: this.now().toISOString(),
                },
              ],
            };
      await this.commit(bundle, actorId, 'value.set', { fieldId, label: field.label }, change);
    });
  }

  async setRecipient(actorId: UserId, docId: DocumentId, r: RecipientInput): Promise<void> {
    return this.serialized(async () => {
      const bundle = await this.loadVisible(docId, actorId);
      this.guard(canEditLayout(bundle.document, actorId), RECIPIENT_LOCKED);
      const recipient = await this.resolveRecipient(r);
      await this.commit(
        bundle,
        actorId,
        'recipient.set',
        { recipientId: recipient.id },
        { document: { ...bundle.document, recipientId: recipient.id } },
      );
    });
  }

  async send(actorId: UserId, docId: DocumentId): Promise<void> {
    return this.serialized(() =>
      this.transition(actorId, docId, 'sent', 'sender', 'document.sent', (at) => ({ sentAt: at })),
    );
  }

  /** First open by the recipient while sent; idempotent. */
  async markViewed(actorId: UserId, docId: DocumentId): Promise<void> {
    return this.serialized(async () => {
      const bundle = await this.load(docId);
      const { document, events } = bundle;
      const isFirstOpen =
        document.status === 'sent' &&
        actorId === document.recipientId &&
        !events.some((e) => e.type === 'document.viewed');
      if (isFirstOpen) await this.commit(bundle, actorId, 'document.viewed', {});
    });
  }

  async finish(actorId: UserId, docId: DocumentId): Promise<void> {
    return this.serialized(() =>
      this.transition(actorId, docId, 'completed', 'recipient', 'document.completed', (at) => ({
        completedAt: at,
      })),
    );
  }

  async listDocumentsFor(userId: UserId): Promise<Document[]> {
    const documents = await this.repo.listDocumentsForUser(userId);
    return documents.filter((d) => canView(d, userId));
  }

  /** Throws NotVisibleError when the user may not see it. */
  async getDocumentFor(docId: DocumentId, userId: UserId): Promise<DocumentBundle> {
    return this.loadVisible(docId, userId);
  }

  /** Upload path: the only write to source documents. */
  async addSourceDocument(
    actorId: UserId,
    source: Omit<SourceDocument, 'id'>,
  ): Promise<SourceDocument> {
    return this.serialized(async () => {
      await this.requireUser(actorId);
      const added: SourceDocument = { ...source, id: `src_${crypto.randomUUID()}` };
      await this.repo.addSourceDocument(added);
      return added;
    });
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
    return this.serialized(() => this.repo.reset());
  }

  /**
   * Commands run one at a time. Each one reads a bundle, awaits the hash, then saves, so two in
   * flight (a field's blur save and a Send click; React's double effect on markViewed) would both
   * build on the same last event and fork the chain.
   */
  private serialized<T>(command: () => Promise<T>): Promise<T> {
    const run = this.lastWrite.then(command);
    this.lastWrite = run.catch(() => undefined);
    return run;
  }

  private guard(allowed: boolean, reason: string): void {
    if (!allowed) throw new GuardError([reason]);
  }

  private async load(docId: DocumentId): Promise<DocumentBundle> {
    const bundle = await this.repo.getDocumentBundle(docId);
    if (!bundle) throw new NotFoundError('Document');
    return bundle;
  }

  private async loadVisible(docId: DocumentId, actorId: UserId): Promise<DocumentBundle> {
    const bundle = await this.load(docId);
    if (!canView(bundle.document, actorId)) throw new NotVisibleError();
    return bundle;
  }

  private async loadField(actorId: UserId, fieldId: FieldId) {
    const docId = await this.repo.findDocumentIdByField(fieldId);
    if (docId === null) throw new NotFoundError('Field');
    const bundle = await this.loadVisible(docId, actorId);
    const field = bundle.fields.find((f) => f.id === fieldId);
    if (!field) throw new NotFoundError('Field');
    return { bundle, field };
  }

  private async requireUser(id: UserId): Promise<User> {
    const user = await this.repo.getUser(id);
    if (!user) throw new NotFoundError('User');
    return user;
  }

  /** The one place an event is built, so change + exactly one event always share a save. */
  private async commit(
    bundle: DocumentBundle,
    actorId: UserId,
    type: AuditEventType,
    data: Record<string, unknown>,
    change: Change = {},
  ): Promise<void> {
    const { id } = bundle.document;
    const event = await this.audit.nextEvent(bundle.events, id, actorId, type, data);
    await this.repo.saveDocumentBundle({
      document: bundle.document,
      ...change,
      appendEvents: [event],
    });
  }

  private async transition(
    actorId: UserId,
    docId: DocumentId,
    to: DocumentStatus,
    party: Assignee,
    eventType: AuditEventType,
    timestamps: (at: string) => Partial<Document>,
  ): Promise<void> {
    const bundle = await this.loadVisible(docId, actorId);
    const { document, fields, values } = bundle;
    const verdict = canTransition(document, to, actorId, fields, values);
    if (!verdict.ok) throw new GuardError(verdict.reasons);

    const signer = await this.requireUser(actorId);
    const now = this.now();
    const autofill = computeAutofill({
      fields,
      assignee: party,
      signerName: signer.name,
      filledBy: actorId,
      now,
    });
    await this.commit(
      bundle,
      actorId,
      eventType,
      { recipientId: document.recipientId, autoFilledFieldIds: autofill.map((v) => v.fieldId) },
      {
        document: { ...document, status: to, ...timestamps(now.toISOString()) },
        upsertValues: autofill,
      },
    );
  }

  private async resolveRecipient(r: RecipientInput): Promise<User> {
    if ('userId' in r) return this.requireUser(r.userId);

    const email = r.email.trim();
    this.guard(isValidEmail(email), 'Enter a valid email address');
    const known = (await this.repo.listUsers()).find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (known) return known;

    const user: User = {
      id: `u_${crypto.randomUUID()}`,
      name: r.name?.trim() || (email.split('@')[0] as string),
      email,
    };
    await this.repo.upsertUser(user);
    return user;
  }
}
