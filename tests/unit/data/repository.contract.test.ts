import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStorageRepository } from '../../../src/data/localStorageRepository';
import { MemoryRepository } from '../../../src/data/memoryRepository';
import type { Repository } from '../../../src/data/repository';
import { STORAGE_KEY } from '../../../src/data/repository';
import { SEED_SOURCE_ID, SEED_USERS } from '../../../src/data/seed';
import type { AuditEvent, Document, Field, FieldValue } from '../../../src/domain/types';

const document = (over: Partial<Document> = {}): Document => ({
  id: 'doc_1',
  sourceDocumentId: SEED_SOURCE_ID,
  title: 'Agreement',
  senderId: 'u_dana',
  recipientId: 'u_bob',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  sentAt: null,
  completedAt: null,
  ...over,
});
const field = (id: string, label = 'Box'): Field => ({
  id,
  documentId: 'doc_1',
  type: 'text',
  label,
  required: true,
  assignee: 'sender',
  page: 1,
  rect: { x: 0, y: 0, w: 0.1, h: 0.1 },
  autoFillSigningDate: false,
  origin: 'manual',
});
const value = (fieldId: string, v = 'hello'): FieldValue => ({
  fieldId,
  documentId: 'doc_1',
  value: v,
  filledBy: 'u_dana',
  filledAt: '2026-01-01T00:00:00.000Z',
});
const event = (seq: number): AuditEvent => ({
  id: `evt_${seq}`,
  documentId: 'doc_1',
  seq,
  actorId: 'u_dana',
  type: 'field.added',
  at: '2026-01-01T00:00:00.000Z',
  data: { n: seq },
  prevHash: 'p',
  hash: 'h',
});

describe.each<[string, () => Repository]>([
  ['MemoryRepository', () => new MemoryRepository()],
  ['LocalStorageRepository', () => createLocalStorageRepository()],
])('Repository contract: %s', (_name, create) => {
  let repo: Repository;

  beforeEach(() => {
    localStorage.clear();
    repo = create();
  });

  it('starts seeded with users and the sample source, and no documents', async () => {
    expect(await repo.listUsers()).toEqual(SEED_USERS);
    expect((await repo.listSourceDocuments()).map((s) => s.id)).toEqual([SEED_SOURCE_ID]);
    expect(await repo.listDocumentsForUser('u_dana')).toEqual([]);
  });

  it('finds users and sources by id, null when unknown', async () => {
    expect((await repo.getUser('u_bob'))?.name).toBe('Bob Smith');
    expect(await repo.getUser('nobody')).toBeNull();
    expect((await repo.getSourceDocument(SEED_SOURCE_ID))?.pageCount).toBe(2);
    expect(await repo.getSourceDocument('nothing')).toBeNull();
    expect(await repo.getDocumentBundle('nothing')).toBeNull();
    expect(await repo.findDocumentIdByField('nothing')).toBeNull();
  });

  it('upsertUser inserts, then replaces', async () => {
    await repo.upsertUser({ id: 'u_new', name: 'New', email: 'n@x.co' });
    await repo.upsertUser({ id: 'u_new', name: 'Renamed', email: 'n@x.co' });
    const users = await repo.listUsers();
    expect(users).toHaveLength(SEED_USERS.length + 1);
    expect(users.find((u) => u.id === 'u_new')?.name).toBe('Renamed');
  });

  it('adds a source document', async () => {
    const source = { id: 'src_2', title: 'T', fileUrl: 'data:x', pageCount: 1, pageSizes: [] };
    await repo.addSourceDocument(source);
    expect(await repo.getSourceDocument('src_2')).toEqual(source);
  });

  it('saves a document, fields, values and events together', async () => {
    await repo.saveDocumentBundle({
      document: document(),
      upsertFields: [field('f1')],
      upsertValues: [value('f1')],
      appendEvents: [event(1)],
    });
    expect(await repo.getDocumentBundle('doc_1')).toEqual({
      document: document(),
      fields: [field('f1')],
      values: [value('f1')],
      events: [event(1)],
    });
    expect(await repo.findDocumentIdByField('f1')).toBe('doc_1');
  });

  it('replaces a document, field and value that already exist', async () => {
    await repo.saveDocumentBundle({
      document: document(),
      upsertFields: [field('f1')],
      upsertValues: [value('f1')],
    });
    await repo.saveDocumentBundle({
      document: document({ title: 'Renamed' }),
      upsertFields: [field('f1', 'Relabelled')],
      upsertValues: [value('f1', 'edited')],
    });
    const bundle = await repo.getDocumentBundle('doc_1');
    expect(bundle?.document.title).toBe('Renamed');
    expect(bundle?.fields).toEqual([field('f1', 'Relabelled')]);
    expect(bundle?.values).toEqual([value('f1', 'edited')]);
  });

  it('removing a field removes its value too', async () => {
    await repo.saveDocumentBundle({
      document: document(),
      upsertFields: [field('f1'), field('f2')],
      upsertValues: [value('f1'), value('f2')],
    });
    await repo.saveDocumentBundle({ document: document(), removeFieldIds: ['f1'] });
    const bundle = await repo.getDocumentBundle('doc_1');
    expect(bundle?.fields.map((f) => f.id)).toEqual(['f2']);
    expect(bundle?.values.map((v) => v.fieldId)).toEqual(['f2']);
  });

  it('removes a value and leaves the field', async () => {
    await repo.saveDocumentBundle({
      document: document(),
      upsertFields: [field('f1')],
      upsertValues: [value('f1')],
    });
    await repo.saveDocumentBundle({ document: document(), removeValueFieldIds: ['f1'] });
    const bundle = await repo.getDocumentBundle('doc_1');
    expect(bundle?.fields).toHaveLength(1);
    expect(bundle?.values).toEqual([]);
  });

  it('appends events and returns them in seq order', async () => {
    await repo.saveDocumentBundle({ document: document(), appendEvents: [event(2)] });
    await repo.saveDocumentBundle({ document: document(), appendEvents: [event(1)] });
    const bundle = await repo.getDocumentBundle('doc_1');
    expect(bundle?.events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('keeps bundles apart', async () => {
    await repo.saveDocumentBundle({ document: document(), upsertFields: [field('f1')] });
    await repo.saveDocumentBundle({ document: document({ id: 'doc_2' }) });
    expect((await repo.getDocumentBundle('doc_2'))?.fields).toEqual([]);
  });

  it('filters documents to sender or recipient, drafts included', async () => {
    await repo.saveDocumentBundle({ document: document() });
    expect(await repo.listDocumentsForUser('u_dana')).toHaveLength(1);
    expect(await repo.listDocumentsForUser('u_bob')).toHaveLength(1);
    expect(await repo.listDocumentsForUser('u_maria')).toEqual([]);
  });

  it('returns copies, so editing a result changes nothing stored', async () => {
    await repo.saveDocumentBundle({
      document: document(),
      upsertFields: [field('f1')],
      appendEvents: [event(1)],
    });
    const bundle = await repo.getDocumentBundle('doc_1');
    bundle!.document.title = 'hacked';
    bundle!.fields[0]!.label = 'hacked';
    bundle!.events[0]!.data.n = 99;
    (await repo.listUsers())[0]!.name = 'hacked';

    const fresh = await repo.getDocumentBundle('doc_1');
    expect(fresh?.document.title).toBe('Agreement');
    expect(fresh?.fields[0]?.label).toBe('Box');
    expect(fresh?.events[0]?.data.n).toBe(1);
    expect((await repo.listUsers())[0]?.name).toBe('Dana Reyes');
  });

  it('does not keep a reference to what was saved', async () => {
    const change = { document: document(), upsertFields: [field('f1')] };
    await repo.saveDocumentBundle(change);
    change.document.title = 'hacked';
    change.upsertFields[0]!.label = 'hacked';
    const bundle = await repo.getDocumentBundle('doc_1');
    expect(bundle?.document.title).toBe('Agreement');
    expect(bundle?.fields[0]?.label).toBe('Box');
  });

  it('reset clears everything and re-seeds', async () => {
    await repo.saveDocumentBundle({ document: document(), upsertFields: [field('f1')] });
    await repo.upsertUser({ id: 'u_new', name: 'New', email: 'n@x.co' });
    await repo.reset();
    expect(await repo.getDocumentBundle('doc_1')).toBeNull();
    expect(await repo.listUsers()).toEqual(SEED_USERS);
  });
});

describe('LocalStorageRepository storage', () => {
  beforeEach(() => localStorage.clear());

  it('seeds one JSON object under the versioned key', () => {
    createLocalStorageRepository();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(Object.keys(stored).sort()).toEqual([
      'documents',
      'events',
      'fields',
      'sourceDocuments',
      'users',
      'values',
    ]);
    expect(localStorage).toHaveLength(1);
  });

  it('writes exactly one setItem per save', async () => {
    const repo = createLocalStorageRepository();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await repo.saveDocumentBundle({
      document: document(),
      upsertFields: [field('f1')],
      upsertValues: [value('f1')],
      appendEvents: [event(1)],
    });
    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it('survives a reload and does not re-seed over existing data', async () => {
    await createLocalStorageRepository().saveDocumentBundle({ document: document() });
    const reloaded = createLocalStorageRepository();
    expect((await reloaded.getDocumentBundle('doc_1'))?.document.title).toBe('Agreement');
  });

  it('changes nothing when the single write fails', async () => {
    const repo = createLocalStorageRepository();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(repo.saveDocumentBundle({ document: document() })).rejects.toThrow('full');
    setItem.mockRestore();
    expect(await repo.getDocumentBundle('doc_1')).toBeNull();
  });
});
