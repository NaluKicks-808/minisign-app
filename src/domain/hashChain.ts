/** Contract (PRD §8). Lane A implements. */
import { NotImplemented } from './errors';
import type { AuditEvent, VerifyResult } from './types';

export const GENESIS_HASH = '0'.repeat(64);
export type HashInput = Pick<
  AuditEvent,
  'documentId' | 'seq' | 'actorId' | 'type' | 'at' | 'data' | 'prevHash'
>;

export async function computeEventHash(_input: HashInput): Promise<string> {
  throw new NotImplemented('computeEventHash');
}
/** Recomputes the chain; reports the first seq that is missing, altered or out of order. */
export async function verifyChain(_events: AuditEvent[]): Promise<VerifyResult> {
  throw new NotImplemented('verifyChain');
}
