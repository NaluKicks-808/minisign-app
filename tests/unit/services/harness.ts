import { MemoryRepository } from '../../../src/data/memoryRepository';
import { SEED_SOURCE_ID } from '../../../src/data/seed';
import type { Repository } from '../../../src/data/repository';
import type { Field } from '../../../src/domain/types';
import { AuditLog } from '../../../src/services/auditLog';
import { DocumentService } from '../../../src/services/documentService';

export const DANA = 'u_dana';
export const BOB = 'u_bob';
export const MARIA = 'u_maria';

/** A local time late in the day, so a UTC-based "today" would give the wrong date in most zones. */
export const NOW = new Date(2026, 4, 15, 23, 30, 0);
export const TODAY = '2026-05-15';

export function harness(repo: Repository = new MemoryRepository()) {
  const now = () => NOW;
  const audit = new AuditLog(repo, now);
  const service = new DocumentService(repo, audit, now);
  return { repo, audit, service };
}
export type Harness = ReturnType<typeof harness>;

export function draftField(over: Partial<Field> = {}): Omit<Field, 'id' | 'documentId'> {
  return {
    type: 'text',
    label: 'Box',
    required: true,
    assignee: 'sender',
    page: 1,
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
    autoFillSigningDate: false,
    origin: 'manual',
    ...over,
  };
}

/** Dana's draft for Bob: one required text field for each party, nothing filled in. */
export async function draftForBob({ service }: Harness) {
  const { id: docId } = await service.createDocument(DANA, SEED_SOURCE_ID);
  await service.setRecipient(DANA, docId, { userId: BOB });
  const senderField = await service.addField(DANA, docId, draftField({ label: 'Company' }));
  const recipientField = await service.addField(
    DANA,
    docId,
    draftField({ label: 'Customer', assignee: 'recipient' }),
  );
  return { docId, senderField, recipientField };
}

export async function sentToBob(h: Harness) {
  const draft = await draftForBob(h);
  await h.service.setValue(DANA, draft.senderField.id, 'Lone Star');
  await h.service.send(DANA, draft.docId);
  return draft;
}

export async function completedByBob(h: Harness) {
  const sent = await sentToBob(h);
  await h.service.setValue(BOB, sent.recipientField.id, 'Acme');
  await h.service.finish(BOB, sent.docId);
  return sent;
}
