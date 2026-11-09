import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalStorageRepository } from '../../../src/data/localStorageRepository';
import type { StoredState } from '../../../src/data/repository';
import { STORAGE_KEY } from '../../../src/data/repository';
import { SEED_SOURCE_ID } from '../../../src/data/seed';
import { canonicalJson } from '../../../src/domain/canonicalJson';
import { computeEventHash, GENESIS_HASH, verifyChain } from '../../../src/domain/hashChain';
import type { AuditEvent, Document } from '../../../src/domain/types';
import {
  BOB,
  completedByBob,
  DANA,
  draftField,
  draftForBob,
  harness,
  type Harness,
} from './harness';

let h: Harness;
beforeEach(() => {
  localStorage.clear();
  h = harness(createLocalStorageRepository());
});

const eventsOf = async (docId: string) => (await h.repo.getDocumentBundle(docId))!.events;

/** Applies a change straight to localStorage, bypassing the service, as the tamper button does. */
function tamper(change: (events: AuditEvent[]) => AuditEvent[]) {
  const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredState;
  state.events = change(state.events);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

describe('every command appends exactly one event, in sequence', () => {
  it('through a whole document life', async () => {
    const { service } = h;
    const doc = await service.createDocument(DANA, SEED_SOURCE_ID);
    const expected: string[] = ['document.created'];

    async function step(type: string, run: () => Promise<unknown>) {
      await run();
      expected.push(type);
      const events = await eventsOf(doc.id);
      expect(events.map((e) => e.type)).toEqual(expected);
      expect(events.map((e) => e.seq)).toEqual(expected.map((_, i) => i + 1));
    }

    await step('recipient.set', () => service.setRecipient(DANA, doc.id, { userId: BOB }));
    const senderField = await service.addField(DANA, doc.id, draftField());
    expected.push('field.added');
    const recipientField = await service.addField(
      DANA,
      doc.id,
      draftField({ assignee: 'recipient' }),
    );
    expected.push('field.added');
    const extra = await service.addField(DANA, doc.id, draftField({ required: false }));
    expected.push('field.added');
    await step('field.updated', () => service.updateField(DANA, extra.id, { label: 'Renamed' }));
    await step('field.removed', () => service.removeField(DANA, extra.id));
    await step('value.set', () => service.setValue(DANA, senderField.id, 'Lone Star'));
    await step('document.sent', () => service.send(DANA, doc.id));
    await step('document.viewed', () => service.markViewed(BOB, doc.id));
    await step('value.set', () => service.setValue(BOB, recipientField.id, 'Acme'));
    await step('document.completed', () => service.finish(BOB, doc.id));

    expect(await h.audit.verify(doc.id)).toEqual({ ok: true });
  });

  it('chains seq 1 from genesis and each later event from the one before', async () => {
    const { docId } = await draftForBob(h);
    const events = await eventsOf(docId);
    expect(events[0]?.prevHash).toBe(GENESIS_HASH);
    events.slice(1).forEach((event, i) => expect(event.prevHash).toBe(events[i]?.hash));
    expect(events[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('markViewed records one event, only for the recipient, only while sent', async () => {
    const { docId } = await completedByBob(h);
    const after = await eventsOf(docId);
    expect(after.filter((e) => e.type === 'document.viewed')).toEqual([]);
    await h.service.markViewed(BOB, docId);
    expect(await eventsOf(docId)).toHaveLength(after.length);

    const fresh = await draftForBob(h);
    await h.service.setValue(DANA, fresh.senderField.id, 'x');
    await h.service.send(DANA, fresh.docId);
    await h.service.markViewed(DANA, fresh.docId);
    expect((await eventsOf(fresh.docId)).some((e) => e.type === 'document.viewed')).toBe(false);

    await h.service.markViewed(BOB, fresh.docId);
    await h.service.markViewed(BOB, fresh.docId);
    expect((await eventsOf(fresh.docId)).filter((e) => e.type === 'document.viewed')).toHaveLength(
      1,
    );
  });

  it('keeps one chain when commands overlap', async () => {
    const { docId, senderField } = await draftForBob(h);
    const before = (await eventsOf(docId)).length;

    await Promise.all([
      h.service.setValue(DANA, senderField.id, 'a'),
      h.service.setValue(DANA, senderField.id, 'b'),
      h.service.send(DANA, docId),
      h.service.markViewed(BOB, docId),
      h.service.markViewed(BOB, docId),
    ]);

    const events = await eventsOf(docId);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events).toHaveLength(before + 4);
    expect(await h.audit.verify(docId)).toEqual({ ok: true });
  });

  it('append saves one event on its own, on the same chain', async () => {
    const { docId } = await draftForBob(h);
    const before = (await eventsOf(docId)).length;
    const event = await h.audit.append(docId, DANA, 'autoprep.suggested', { count: 3 });
    expect(event.seq).toBe(before + 1);
    expect(await eventsOf(docId)).toHaveLength(before + 1);
    expect(await h.audit.verify(docId)).toEqual({ ok: true });
  });
});

describe('verify reports where stored history broke', () => {
  let docId: string;
  beforeEach(async () => {
    ({ docId } = await draftForBob(h));
    expect((await eventsOf(docId)).length).toBe(4);
  });

  it('passes on an untouched log', async () => {
    expect(await h.audit.verify(docId)).toEqual({ ok: true });
  });

  it.each([1, 2, 3, 4])('reports an edit to the data of event %i', async (seq) => {
    tamper((events) =>
      events.map((e) => (e.seq === seq ? { ...e, data: { ...e.data, forged: true } } : e)),
    );
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: seq });
  });

  it.each([1, 2, 3])('reports the missing seq when event %i is deleted', async (seq) => {
    tamper((events) => events.filter((e) => e.seq !== seq));
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: seq });
  });

  it('reports the seq after the last survivor when the newest event is deleted', async () => {
    tamper((events) => events.filter((e) => e.seq !== 4));
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: 4 });
  });

  it('reports the seq after the last survivor when several newest events are deleted', async () => {
    tamper((events) => events.filter((e) => e.seq <= 2));
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: 3 });
  });

  it('reports seq 1 when every event is deleted', async () => {
    tamper(() => []);
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: 1 });
  });

  it('reports the newest seq when a forger recomputes the newest event', async () => {
    const forged = (await eventsOf(docId)).find((e) => e.seq === 4)!;
    const data = { forged: true };
    const hash = await computeEventHash({ ...forged, data });
    tamper((events) => events.map((e) => (e.seq === 4 ? { ...e, data, hash } : e)));
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: 4 });
  });

  it('still verifies a document stored before auditHead existed', async () => {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredState;
    for (const doc of state.documents) delete (doc as Partial<Document>).auditHead;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    expect(await h.audit.verify(docId)).toEqual({ ok: true });
  });

  it('reports a wrong prevHash at that seq', async () => {
    tamper((events) => events.map((e) => (e.seq === 3 ? { ...e, prevHash: 'f'.repeat(64) } : e)));
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: 3 });
  });

  it('reports the next event when a forger also recomputes the edited hash', async () => {
    const forged = (await eventsOf(docId)).find((e) => e.seq === 2)!;
    const data = { forged: true };
    const hash = await computeEventHash({ ...forged, data });
    tamper((events) => events.map((e) => (e.seq === 2 ? { ...e, data, hash } : e)));
    expect(await h.audit.verify(docId)).toEqual({ ok: false, brokenAtSeq: 3 });
  });

  it('reports out-of-order events at the first misplaced seq', async () => {
    const [first, second] = await eventsOf(docId);
    expect(await verifyChain([second!, first!])).toEqual({ ok: false, brokenAtSeq: 1 });
  });
});

describe('hashing', () => {
  it('canonical JSON sorts keys at every depth, with no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x y' } })).toBe(
      '{"a":{"c":"x y","d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('is SHA-256 of the canonical JSON of exactly the seven chained members', async () => {
    const input = {
      documentId: 'd',
      seq: 2,
      actorId: 'a',
      type: 'value.set' as const,
      at: 't',
      data: { b: 1, a: 'é' },
      prevHash: 'p',
    };
    const canonical =
      '{"actorId":"a","at":"t","data":{"a":"é","b":1},"documentId":"d","prevHash":"p","seq":2,"type":"value.set"}';
    expect(await computeEventHash(input)).toBe(
      createHash('sha256').update(canonical).digest('hex'),
    );
  });

  it('gives the same hash however the data keys were ordered', async () => {
    const base = {
      documentId: 'd',
      seq: 1,
      actorId: 'a',
      type: 'field.added' as const,
      at: 't',
      prevHash: GENESIS_HASH,
    };
    expect(await computeEventHash({ ...base, data: { x: 1, y: 2 } })).toBe(
      await computeEventHash({ ...base, data: { y: 2, x: 1 } }),
    );
  });
});
