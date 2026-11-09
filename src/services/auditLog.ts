/** Contract (PRD §7, §8). */
import type { Repository } from '../data/repository';
import { NotFoundError } from '../domain/errors';
import { computeEventHash, GENESIS_HASH, verifyChain } from '../domain/hashChain';
import type {
  AuditEvent,
  AuditEventType,
  DocumentBundle,
  DocumentId,
  UserId,
  VerifyResult,
} from '../domain/types';

export class AuditLog {
  constructor(
    protected readonly repo: Repository,
    protected readonly now: () => Date = () => new Date(),
  ) {}

  /** Builds the next event(s) WITHOUT saving, so a command can save change + event atomically. */
  async nextEvent(
    existing: AuditEvent[],
    documentId: DocumentId,
    actorId: UserId,
    type: AuditEventType,
    data: Record<string, unknown>,
  ): Promise<AuditEvent> {
    const last = existing.at(-1);
    const input = {
      documentId,
      seq: (last?.seq ?? 0) + 1,
      actorId,
      type,
      at: this.now().toISOString(),
      data,
      prevHash: last?.hash ?? GENESIS_HASH,
    };
    return { ...input, id: `evt_${crypto.randomUUID()}`, hash: await computeEventHash(input) };
  }

  /** Builds and saves one event on its own. */
  async append(
    documentId: DocumentId,
    actorId: UserId,
    type: AuditEventType,
    data: Record<string, unknown>,
  ): Promise<AuditEvent> {
    const { document, events } = await this.load(documentId);
    const event = await this.nextEvent(events, documentId, actorId, type, data);
    await this.repo.saveDocumentBundle({ document, appendEvents: [event] });
    return event;
  }

  async verify(documentId: DocumentId): Promise<VerifyResult> {
    const { events } = await this.load(documentId);
    return verifyChain(events);
  }

  private async load(documentId: DocumentId): Promise<DocumentBundle> {
    const bundle = await this.repo.getDocumentBundle(documentId);
    if (!bundle) throw new NotFoundError('Document');
    return bundle;
  }
}
