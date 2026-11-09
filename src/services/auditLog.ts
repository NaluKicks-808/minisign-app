/** Contract (PRD §7, §8). Lane A implements. */
import type { Repository } from '../data/repository';
import { NotImplemented } from '../domain/errors';
import type {
  AuditEvent,
  AuditEventType,
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
    _existing: AuditEvent[],
    _documentId: DocumentId,
    _actorId: UserId,
    _type: AuditEventType,
    _data: Record<string, unknown>,
  ): Promise<AuditEvent> {
    throw new NotImplemented('AuditLog.nextEvent');
  }
  /** Builds and saves one event on its own. */
  async append(
    _documentId: DocumentId,
    _actorId: UserId,
    _type: AuditEventType,
    _data: Record<string, unknown>,
  ): Promise<AuditEvent> {
    throw new NotImplemented('AuditLog.append');
  }
  async verify(_documentId: DocumentId): Promise<VerifyResult> {
    throw new NotImplemented('AuditLog.verify');
  }
}
