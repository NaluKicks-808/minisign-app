import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED_SOURCE_ID } from '../../../src/data/seed';
import { GuardError, NotVisibleError } from '../../../src/domain/errors';
import type { Field } from '../../../src/domain/types';
import {
  BOB,
  completedByBob,
  DANA,
  draftField,
  draftForBob,
  harness,
  type Harness,
  MARIA,
  NOW,
  sentToBob,
  TODAY,
} from './harness';

let h: Harness;
beforeEach(() => {
  h = harness();
});

const bundleOf = (docId: string) => h.repo.getDocumentBundle(docId);
const valueOf = async (docId: string, fieldId: string) =>
  (await bundleOf(docId))?.values.find((v) => v.fieldId === fieldId)?.value;

async function expectNothingWritten(
  docId: string,
  attempt: () => Promise<unknown>,
  error: unknown,
) {
  const before = await bundleOf(docId);
  await expect(attempt()).rejects.toBeInstanceOf(error);
  expect(await bundleOf(docId)).toEqual(before);
}

/** Every mutation a user can attempt on a document. */
function mutations(docId: string, actor: string, field: Field) {
  const { service } = h;
  return {
    addField: () => service.addField(actor, docId, draftField()),
    updateField: () => service.updateField(actor, field.id, { label: 'New' }),
    removeField: () => service.removeField(actor, field.id),
    setValue: () => service.setValue(actor, field.id, 'x'),
    clearValue: () => service.setValue(actor, field.id, null),
    setRecipient: () => service.setRecipient(actor, docId, { userId: MARIA }),
    send: () => service.send(actor, docId),
    finish: () => service.finish(actor, docId),
  };
}

describe('locking', () => {
  it('after send, the sender cannot change layout or sender values', async () => {
    const { docId, senderField } = await sentToBob(h);
    const m = mutations(docId, DANA, senderField);
    await expectNothingWritten(docId, m.addField, GuardError);
    await expectNothingWritten(docId, m.updateField, GuardError);
    await expectNothingWritten(docId, m.removeField, GuardError);
    await expectNothingWritten(docId, m.setValue, GuardError);
    await expectNothingWritten(docId, m.setRecipient, GuardError);
  });

  it('during send, the recipient cannot write a sender field', async () => {
    const { docId, senderField } = await sentToBob(h);
    const m = mutations(docId, BOB, senderField);
    await expectNothingWritten(docId, m.setValue, GuardError);
  });

  it('during send, the sender cannot write a recipient field', async () => {
    const { docId, recipientField } = await sentToBob(h);
    await expectNothingWritten(docId, mutations(docId, DANA, recipientField).setValue, GuardError);
  });

  it('during send, the recipient cannot change the layout', async () => {
    const { docId, recipientField } = await sentToBob(h);
    const m = mutations(docId, BOB, recipientField);
    await expectNothingWritten(docId, m.addField, GuardError);
    await expectNothingWritten(docId, m.updateField, GuardError);
    await expectNothingWritten(docId, m.removeField, GuardError);
  });

  it.each([
    ['sender', DANA],
    ['recipient', BOB],
  ])('after completion, every mutation throws for the %s', async (_role, actor) => {
    const { docId, senderField, recipientField } = await completedByBob(h);
    for (const field of [senderField, recipientField]) {
      for (const attempt of Object.values(mutations(docId, actor, field))) {
        await expectNothingWritten(docId, attempt, GuardError);
      }
    }
  });

  it('in draft, every recipient write throws', async () => {
    const { docId, senderField, recipientField } = await draftForBob(h);
    for (const field of [senderField, recipientField]) {
      for (const attempt of Object.values(mutations(docId, BOB, field))) {
        await expectNothingWritten(docId, attempt, NotVisibleError);
      }
    }
  });

  it('in draft, the sender cannot fill a recipient field', async () => {
    const { docId, recipientField } = await draftForBob(h);
    await expectNothingWritten(docId, mutations(docId, DANA, recipientField).setValue, GuardError);
  });

  it('nobody can type into an auto-filled field', async () => {
    const { docId } = await draftForBob(h);
    const name = await h.service.addField(DANA, docId, draftField({ type: 'signerName' }));
    const date = await h.service.addField(
      DANA,
      docId,
      draftField({ type: 'date', autoFillSigningDate: true }),
    );
    await expectNothingWritten(docId, () => h.service.setValue(DANA, name.id, 'Me'), GuardError);
    await expectNothingWritten(docId, () => h.service.setValue(DANA, date.id, TODAY), GuardError);
  });

  it('a non-party cannot write at any stage', async () => {
    const { docId, senderField } = await sentToBob(h);
    for (const attempt of Object.values(mutations(docId, MARIA, senderField))) {
      await expectNothingWritten(docId, attempt, NotVisibleError);
    }
  });

  it('send and finish run the guards in the service', async () => {
    const { docId } = await draftForBob(h);
    await expect(h.service.send(DANA, docId)).rejects.toMatchObject({
      reasons: ['Company is required'],
    });
    expect((await bundleOf(docId))?.document.status).toBe('draft');

    const sent = await sentToBob(h);
    await expect(h.service.finish(BOB, sent.docId)).rejects.toMatchObject({
      reasons: ['Customer is required'],
    });
    expect((await bundleOf(sent.docId))?.document.status).toBe('sent');
  });
});

describe('visibility', () => {
  it("listDocumentsFor(u_maria) excludes Bob's documents", async () => {
    await sentToBob(h);
    expect(await h.service.listDocumentsFor(MARIA)).toEqual([]);
  });

  it('the sender and recipient of a sent document both list it', async () => {
    const { docId } = await sentToBob(h);
    expect((await h.service.listDocumentsFor(DANA)).map((d) => d.id)).toEqual([docId]);
    expect((await h.service.listDocumentsFor(BOB)).map((d) => d.id)).toEqual([docId]);
  });

  it('getDocumentFor throws for a non-party', async () => {
    const { docId } = await sentToBob(h);
    await expect(h.service.getDocumentFor(docId, MARIA)).rejects.toBeInstanceOf(NotVisibleError);
  });

  it('the recipient cannot see a draft, in the list or by id', async () => {
    const { docId } = await draftForBob(h);
    expect(await h.service.listDocumentsFor(BOB)).toEqual([]);
    await expect(h.service.getDocumentFor(docId, BOB)).rejects.toBeInstanceOf(NotVisibleError);
    expect((await h.service.getDocumentFor(docId, DANA)).document.id).toBe(docId);
  });
});

describe('auto-fill', () => {
  async function withAutoFields() {
    const draft = await draftForBob(h);
    const add = (over: Partial<Field>) => h.service.addField(DANA, draft.docId, draftField(over));
    const auto = {
      senderName: await add({ type: 'signerName' }),
      senderDate: await add({ type: 'date', autoFillSigningDate: true }),
      recipientName: await add({ type: 'signerName', assignee: 'recipient' }),
      recipientDate: await add({ type: 'date', autoFillSigningDate: true, assignee: 'recipient' }),
    };
    await h.service.setValue(DANA, draft.senderField.id, 'Lone Star');
    return { ...draft, auto };
  }

  it('on send, fills only the sender, atomically with the status change', async () => {
    const { docId, auto } = await withAutoFields();
    const save = vi.spyOn(h.repo, 'saveDocumentBundle');

    await h.service.send(DANA, docId);

    expect(save).toHaveBeenCalledTimes(1);
    const change = save.mock.calls[0]![0];
    expect(change.document).toMatchObject({ status: 'sent', sentAt: NOW.toISOString() });
    expect(change.upsertValues?.map((v) => [v.fieldId, v.value])).toEqual([
      [auto.senderName.id, 'Dana Reyes'],
      [auto.senderDate.id, TODAY],
    ]);
    expect(change.appendEvents?.map((e) => e.type)).toEqual(['document.sent']);
    expect(await valueOf(docId, auto.recipientName.id)).toBeUndefined();
  });

  it('on finish, fills the recipient, atomically with the status change', async () => {
    const { docId, recipientField, auto } = await withAutoFields();
    await h.service.send(DANA, docId);
    await h.service.setValue(BOB, recipientField.id, 'Acme');
    const save = vi.spyOn(h.repo, 'saveDocumentBundle');

    await h.service.finish(BOB, docId);

    expect(save).toHaveBeenCalledTimes(1);
    const change = save.mock.calls[0]![0];
    expect(change.document).toMatchObject({ status: 'completed', completedAt: NOW.toISOString() });
    expect(change.upsertValues?.map((v) => [v.fieldId, v.value, v.filledBy])).toEqual([
      [auto.recipientName.id, 'Bob Smith', BOB],
      [auto.recipientDate.id, TODAY, BOB],
    ]);
    expect(change.appendEvents?.map((e) => e.type)).toEqual(['document.completed']);
    expect(await valueOf(docId, auto.senderName.id)).toBe('Dana Reyes');
  });
});

describe('commands', () => {
  it('createDocument starts a draft titled after its source', async () => {
    const doc = await h.service.createDocument(DANA, SEED_SOURCE_ID);
    expect(doc.id).toMatch(/^doc_/);
    expect(doc).toMatchObject({
      title: 'Lone Star Fleet Services: Master Agreement',
      senderId: DANA,
      recipientId: null,
      status: 'draft',
    });
  });

  it('setValue stores an invalid value, and null or empty removes it', async () => {
    const { docId } = await draftForBob(h);
    const email = await h.service.addField(DANA, docId, draftField({ type: 'email' }));

    await h.service.setValue(DANA, email.id, 'not-an-email');
    expect(await valueOf(docId, email.id)).toBe('not-an-email');
    await h.service.setValue(DANA, email.id, null);
    expect(await valueOf(docId, email.id)).toBeUndefined();

    await h.service.setValue(DANA, email.id, 'again');
    await h.service.setValue(DANA, email.id, '');
    expect(await valueOf(docId, email.id)).toBeUndefined();
  });

  it('value events carry the field but never the value', async () => {
    const { docId, senderField } = await draftForBob(h);
    await h.service.setValue(DANA, senderField.id, 'secret');
    const event = (await bundleOf(docId))?.events.at(-1);
    expect(event).toMatchObject({
      type: 'value.set',
      data: { fieldId: senderField.id, label: 'Company' },
    });
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it.each([
    ['type', { type: 'email' as const }],
    ['assignee', { assignee: 'recipient' as const }],
  ])('updateField changing %s clears the value in the same save', async (_key, patch) => {
    const { docId, senderField } = await draftForBob(h);
    await h.service.setValue(DANA, senderField.id, 'filled');
    const save = vi.spyOn(h.repo, 'saveDocumentBundle');

    await h.service.updateField(DANA, senderField.id, patch);

    expect(save).toHaveBeenCalledTimes(1);
    expect(await valueOf(docId, senderField.id)).toBeUndefined();
  });

  it('updateField turning autoFillSigningDate on clears the value in the same save', async () => {
    const { docId } = await draftForBob(h);
    const date = await h.service.addField(DANA, docId, draftField({ type: 'date' }));
    await h.service.setValue(DANA, date.id, '2026-01-02');
    const save = vi.spyOn(h.repo, 'saveDocumentBundle');

    await h.service.updateField(DANA, date.id, { autoFillSigningDate: true });

    expect(save).toHaveBeenCalledTimes(1);
    expect(await valueOf(docId, date.id)).toBeUndefined();
  });

  it('updateField keeps the value when the auto-date flag means nothing or was already on', async () => {
    const { docId, senderField } = await draftForBob(h);
    await h.service.setValue(DANA, senderField.id, 'filled');
    await h.service.updateField(DANA, senderField.id, { autoFillSigningDate: true });
    expect(await valueOf(docId, senderField.id)).toBe('filled');
  });

  it('updateField keeps the value on any other change, or a same-value patch', async () => {
    const { docId, senderField } = await draftForBob(h);
    await h.service.setValue(DANA, senderField.id, 'filled');
    await h.service.updateField(DANA, senderField.id, { label: 'Renamed', type: 'text' });
    await h.service.updateField(DANA, senderField.id, {
      rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
    });
    expect(await valueOf(docId, senderField.id)).toBe('filled');
  });

  it('setRecipient creates a user for a new email, named from the input or the address', async () => {
    const { docId } = await draftForBob(h);
    await h.service.setRecipient(DANA, docId, { email: 'kai@new.example' });
    const first = await h.repo.getUser((await bundleOf(docId))!.document.recipientId!);
    expect(first).toMatchObject({ name: 'kai', email: 'kai@new.example' });
    expect(first?.id).toMatch(/^u_/);

    await h.service.setRecipient(DANA, docId, { name: 'Lei Ono', email: 'lei@new.example' });
    const second = await h.repo.getUser((await bundleOf(docId))!.document.recipientId!);
    expect(second?.name).toBe('Lei Ono');
  });

  it('setRecipient reuses a known email and creates no user', async () => {
    const { docId } = await draftForBob(h);
    const count = (await h.repo.listUsers()).length;
    await h.service.setRecipient(DANA, docId, {
      name: 'Other',
      email: 'MARIA@coastalfreight.example',
    });
    expect((await bundleOf(docId))?.document.recipientId).toBe(MARIA);
    expect(await h.repo.listUsers()).toHaveLength(count);
  });

  it('setRecipient refuses a malformed email and creates no user', async () => {
    const { docId } = await draftForBob(h);
    const count = (await h.repo.listUsers()).length;
    await expectNothingWritten(
      docId,
      () => h.service.setRecipient(DANA, docId, { email: 'nope' }),
      GuardError,
    );
    expect(await h.repo.listUsers()).toHaveLength(count);
  });

  it('addSourceDocument assigns a src_ id', async () => {
    const added = await h.service.addSourceDocument(DANA, {
      title: 'Upload',
      fileUrl: 'data:application/pdf;base64,x',
      pageCount: 1,
      pageSizes: [{ widthPt: 612, heightPt: 792 }],
    });
    expect(added.id).toMatch(/^src_/);
    expect(await h.service.getSourceDocument(added.id)).toEqual(added);
  });

  it('resetDemo returns to the seed', async () => {
    const { docId } = await sentToBob(h);
    await h.service.resetDemo();
    expect(await bundleOf(docId)).toBeNull();
    expect(await h.service.listDocumentsFor(DANA)).toEqual([]);
  });
});
