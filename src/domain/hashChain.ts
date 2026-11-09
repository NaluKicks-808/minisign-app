/** Contract (PRD §8). */
import { canonicalJson } from './canonicalJson';
import type { AuditEvent, VerifyResult } from './types';

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

/** Recomputes the chain; reports the first seq that is missing, altered or out of order. */
export async function verifyChain(events: AuditEvent[]): Promise<VerifyResult> {
  let expectedPrevHash = GENESIS_HASH;
  for (const [index, event] of events.entries()) {
    const expectedSeq = index + 1;
    if (event.seq !== expectedSeq) return { ok: false, brokenAtSeq: expectedSeq };
    if (event.prevHash !== expectedPrevHash) return { ok: false, brokenAtSeq: event.seq };
    if ((await computeEventHash(event)) !== event.hash)
      return { ok: false, brokenAtSeq: event.seq };
    expectedPrevHash = event.hash;
  }
  return { ok: true };
}
