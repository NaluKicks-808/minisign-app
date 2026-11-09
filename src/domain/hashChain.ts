/** Contract (PRD §8). */
import { canonicalJson } from './canonicalJson';
import type { AuditEvent, Document, VerifyResult } from './types';

export const GENESIS_HASH = '0'.repeat(64);
export type HashInput = Pick<
  AuditEvent,
  'documentId' | 'seq' | 'actorId' | 'type' | 'at' | 'data' | 'prevHash'
>;

export async function computeEventHash(input: HashInput): Promise<string> {
  const { documentId, seq, actorId, type, at, data, prevHash } = input;
  const canonical = canonicalJson({ documentId, seq, actorId, type, at, data, prevHash });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Recomputes the chain; reports the first seq that is missing, altered or out of order.
 * A chain alone cannot show that its newest events were deleted, so the stored head is compared.
 * No head (a document saved before it existed) means only the chain is checked.
 */
export async function verifyChain(
  events: AuditEvent[],
  head: Document['auditHead'] = null,
): Promise<VerifyResult> {
  let expectedPrevHash = GENESIS_HASH;
  for (const [index, event] of events.entries()) {
    const expectedSeq = index + 1;
    if (event.seq !== expectedSeq) return { ok: false, brokenAtSeq: expectedSeq };
    if (event.prevHash !== expectedPrevHash) return { ok: false, brokenAtSeq: event.seq };
    if ((await computeEventHash(event)) !== event.hash)
      return { ok: false, brokenAtSeq: event.seq };
    expectedPrevHash = event.hash;
  }
  if (head) {
    const last = events.at(-1);
    const lastSeq = last?.seq ?? 0;
    if (lastSeq !== head.seq) return { ok: false, brokenAtSeq: Math.min(lastSeq, head.seq) + 1 };
    if (last?.hash !== head.hash) return { ok: false, brokenAtSeq: head.seq };
  }
  return { ok: true };
}
