/**
 * Seeded pseudo-random command sequences against the real services.
 *
 * The rules below come from PRD §5, §6, §7 and §8 and are written out here on purpose, without
 * importing stateMachine, permissions or validation. A shared bug in those modules cannot then hide
 * from this test. The model predicts whether each command is accepted and what the document looks
 * like afterwards; after every command the repository has to agree with it.
 */
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../../../src/data/memoryRepository';
import { SEED_SOURCE_ID } from '../../../src/data/seed';
import { GuardError, NotFoundError, NotVisibleError } from '../../../src/domain/errors';
import type {
  DocumentBundle,
  DocumentStatus,
  Field,
  FieldPatch,
  FieldType,
  FieldValue,
  FieldValueContent,
  RecipientInput,
  UserId,
} from '../../../src/domain/types';
import { AuditLog } from '../../../src/services/auditLog';
import { DocumentService } from '../../../src/services/documentService';

const SEQUENCE_COUNT = 240;
const MAX_COMMANDS = 40;

const DANA = 'u_dana';
const BOB = 'u_bob';
const MARIA = 'u_maria';
const ACTORS: UserId[] = [DANA, BOB, MARIA];

/** PRD §2. */
const SEEDED_USERS: Record<UserId, { name: string; email: string }> = {
  [DANA]: { name: 'Dana Reyes', email: 'dana@lonestarfleet.example' },
  [BOB]: { name: 'Bob Smith', email: 'bob@acmetrucking.example' },
  [MARIA]: { name: 'Maria Lopez', email: 'maria@coastalfreight.example' },
};

/** Late in the local day: a UTC-based "today" would be wrong in most zones. */
const CLOCK_START = new Date(2026, 4, 15, 23, 30, 0).getTime();
const TODAY = '2026-05-15';

/** mulberry32: small, deterministic and independent of Math.random. */
class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }
  weighted<T>(table: readonly (readonly [T, number])[]): T {
    let roll = this.next() * table.reduce((sum, [, w]) => sum + w, 0);
    for (const [item, weight] of table) {
      roll -= weight;
      if (roll < 0) return item;
    }
    return (table.at(-1) as readonly [T, number])[0];
  }
}

// ---- PRD §5 and §6, restated ----

const isAuto = (f: Field) => f.type === 'signerName' || (f.type === 'date' && f.autoFillSigningDate);

function isEmptyValue(v: FieldValueContent | undefined): boolean {
  if (v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return v.kind === 'typed' ? v.text.trim() === '' : v.pngDataUrl === '';
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** §6, for a value that is not empty. */
function passesTypeCheck(type: FieldType, v: FieldValueContent): boolean {
  if (type === 'signature') {
    if (typeof v === 'string') return false;
    return v.kind === 'drawn' ? v.pngDataUrl !== '' : v.text.replace(/\s/g, '').length >= 2;
  }
  if (typeof v !== 'string') return false;
  if (type === 'email') {
    const parts = v.split('@');
    return parts.length === 2 && parts[0] !== '' && (parts[1] as string).includes('.') && !/\s/.test(v);
  }
  if (type === 'phone') {
    const stripped = v.replace(/[ .()-]/g, '');
    const digits = stripped.startsWith('+') ? stripped.slice(1) : stripped;
    return /^[0-9]+$/.test(digits) && digits.length >= 7 && digits.length <= 15;
  }
  if (type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  }
  return true;
}

/** §5 and §6: auto-filled fields are excluded; empty is fine only when optional. */
function satisfied(f: Field, v: FieldValueContent | undefined): boolean {
  if (isAuto(f)) return true;
  if (isEmptyValue(v)) return !f.required;
  return passesTypeCheck(f.type, v as FieldValueContent);
}

interface ModelDoc {
  n: number;
  id: string;
  senderId: UserId;
  recipientId: UserId | null;
  status: DocumentStatus;
  viewed: boolean;
  fields: Field[];
  values: Map<string, { value: FieldValueContent; filledBy: UserId }>;
  eventCount: number;
  /** Taken from the repository at the moment of send. */
  layoutAtSend: Field[] | null;
  senderValuesAtSend: FieldValue[] | null;
  /** The whole bundle at the moment of completion. */
  bundleAtCompletion: DocumentBundle | null;
}

const canSee = (d: ModelDoc, a: UserId) =>
  a === d.senderId || (a === d.recipientId && d.status !== 'draft');

const canEditLayoutRule = (d: ModelDoc, a: UserId) => d.status === 'draft' && a === d.senderId;

/**
 * §5 edit table. §6 says signerName is never user-edited. §5 and §16 show an auto date as the
 * "Fills in on signing" placeholder, so it has no input and takes no typed value either.
 */
function canEditValueRule(d: ModelDoc, f: Field, a: UserId): boolean {
  if (isAuto(f)) return false;
  if (d.status === 'draft') return f.assignee === 'sender' && a === d.senderId;
  if (d.status === 'sent') return f.assignee === 'recipient' && a === d.recipientId;
  return false;
}

const partyFieldsSatisfied = (d: ModelDoc, party: Field['assignee']) =>
  d.fields
    .filter((f) => f.assignee === party)
    .every((f) => satisfied(f, d.values.get(f.id)?.value));

function sendAllowed(d: ModelDoc, a: UserId): boolean {
  return (
    d.status === 'draft' &&
    a === d.senderId &&
    d.recipientId !== null &&
    d.recipientId !== d.senderId &&
    d.fields.some((f) => f.assignee === 'recipient') &&
    partyFieldsSatisfied(d, 'sender')
  );
}

const finishAllowed = (d: ModelDoc, a: UserId) =>
  d.status === 'sent' && a === d.recipientId && partyFieldsSatisfied(d, 'recipient');

// ---- Value and field generators ----

const VALID_VALUES: Record<FieldType, FieldValueContent[]> = {
  text: ['Acme', '  padded  ', 'x'],
  email: ['a@b.co', 'bob@acmetrucking.example', 'first.last@sub.example.org'],
  phone: ['5125550100', '+1 (512) 555-0100', '512.555.0100', '1234567'],
  date: ['2026-02-28', '2024-02-29', '2026-12-31'],
  signature: [
    { kind: 'typed', text: 'DR' },
    { kind: 'typed', text: 'Dana Reyes' },
    { kind: 'drawn', pngDataUrl: 'data:image/png;base64,AAAA' },
  ],
  signerName: ['Typed Name'],
};

const INVALID_VALUES: Record<FieldType, FieldValueContent[]> = {
  text: ['   ', { kind: 'typed', text: 'A signature' }],
  email: ['bob@nowhere', 'no-at.example', 'a b@c.de', 'a@@b.co', '@b.co', '   '],
  phone: ['12', 'abc', '+', '1234567890123456', '555-01', '   '],
  date: ['2026-02-30', '2026-13-01', '05/15/2026', '2026-1-1', 'tomorrow', '2025-02-29'],
  signature: [
    { kind: 'typed', text: 'A' },
    { kind: 'typed', text: '   ' },
    { kind: 'drawn', pngDataUrl: '' },
    'just text',
  ],
  signerName: ['Typed Name'],
};

const FIELD_TYPES: FieldType[] = ['text', 'email', 'phone', 'date', 'signature', 'signerName'];

function randomRect(rng: Rng) {
  return { x: rng.next() * 0.7, y: rng.next() * 0.7, w: 0.02 + rng.next() * 0.2, h: 0.012 + rng.next() * 0.1 };
}

function randomDraft(rng: Rng): Omit<Field, 'id' | 'documentId'> {
  return {
    type: rng.pick(FIELD_TYPES),
    label: `L${rng.int(1000)}`,
    required: rng.chance(0.7),
    assignee: rng.chance(0.55) ? 'recipient' : 'sender',
    page: 1 + rng.int(2),
    rect: randomRect(rng),
    autoFillSigningDate: rng.chance(0.3),
    origin: rng.chance(0.5) ? 'manual' : 'autoprep',
  };
}

function randomPatch(rng: Rng): FieldPatch {
  switch (rng.int(7)) {
    case 0:
      return { label: `P${rng.int(1000)}` };
    case 1:
      return { required: rng.chance(0.5) };
    case 2:
      return { assignee: rng.chance(0.5) ? 'sender' : 'recipient' };
    case 3:
      return { type: rng.pick(FIELD_TYPES) };
    case 4:
      return { rect: randomRect(rng) };
    case 5:
      return { page: 1 + rng.int(2) };
    default:
      return { autoFillSigningDate: rng.chance(0.5) };
  }
}

// ---- Commands ----

type CommandName =
  | 'createDocument'
  | 'addField'
  | 'updateField'
  | 'removeField'
  | 'setValue'
  | 'setRecipient'
  | 'send'
  | 'finish'
  | 'markViewed';

const EVENT_TYPE: Record<CommandName, string> = {
  createDocument: 'document.created',
  addField: 'field.added',
  updateField: 'field.updated',
  removeField: 'field.removed',
  setValue: 'value.set',
  setRecipient: 'recipient.set',
  send: 'document.sent',
  finish: 'document.completed',
  markViewed: 'document.viewed',
};

interface Command {
  name: CommandName;
  trace: string;
  actor: UserId;
  /** Undefined when the command targets no existing document. */
  doc?: ModelDoc;
  /** The PRD's verdict. */
  allowed: boolean;
  run: () => Promise<unknown>;
  /** Moves the model forward. Called only when the command was allowed and accepted. */
  apply: (result: unknown, after: DocumentBundle | null) => void;
}

interface Coverage {
  sequences: number;
  commands: number;
  accepted: Partial<Record<CommandName, number>>;
  refused: Partial<Record<CommandName, number>>;
  docsCreated: number;
  docsSent: number;
  docsCompleted: number;
  /** The sender trying to change a value they no longer own, once the document has left draft. */
  senderValueWritesAfterSend: number;
  /** The sender trying to change the layout once the document has left draft. */
  senderLayoutWritesAfterSend: number;
  /** Send or Finish tried when an invalid optional value was the only thing in the way (§6). */
  optionalInvalidTransitions: number;
}

const coverage: Coverage = {
  sequences: 0,
  commands: 0,
  accepted: {},
  refused: {},
  docsCreated: 0,
  docsSent: 0,
  docsCompleted: 0,
  senderValueWritesAfterSend: 0,
  senderLayoutWritesAfterSend: 0,
  optionalInvalidTransitions: 0,
};

const sentOrLater = (d: ModelDoc) => d.status !== 'draft';

class World {
  readonly repo = new MemoryRepository();
  private tick = 0;
  private readonly now = () => new Date(CLOCK_START + this.tick * 1000);
  readonly audit = new AuditLog(this.repo, this.now);
  readonly service = new DocumentService(this.repo, this.audit, this.now);
  readonly docs: ModelDoc[] = [];
  readonly names = new Map<UserId, string>(
    Object.entries(SEEDED_USERS).map(([id, u]) => [id, u.name]),
  );
  private newEmails = 0;

  advanceClock() {
    this.tick += 1;
  }

  freshEmail() {
    this.newEmails += 1;
    return `new${this.newEmails}@example.test`;
  }

  async bundle(id: string): Promise<DocumentBundle> {
    const b = await this.repo.getDocumentBundle(id);
    if (!b) throw new Error(`Bundle ${id} disappeared`);
    return b;
  }

  async allBundles(): Promise<Map<string, DocumentBundle>> {
    const entries = await Promise.all(
      this.docs.map(async (d) => [d.id, await this.bundle(d.id)] as const),
    );
    return new Map(entries);
  }
}

function createCommand(w: World, rng: Rng): Command {
  const actor = rng.pick(ACTORS);
  const bogus = rng.chance(0.12);
  const source = bogus ? 'src_nope' : SEED_SOURCE_ID;
  return {
    name: 'createDocument',
    trace: `createDocument(${actor}, ${source})`,
    actor,
    allowed: !bogus,
    run: () => w.service.createDocument(actor, source),
    apply: (result) => {
      const created = result as { id: string };
      w.docs.push({
        n: w.docs.length,
        id: created.id,
        senderId: actor,
        recipientId: null,
        status: 'draft',
        viewed: false,
        fields: [],
        values: new Map(),
        eventCount: 0,
        layoutAtSend: null,
        senderValuesAtSend: null,
        bundleAtCompletion: null,
      });
      coverage.docsCreated += 1;
    },
  };
}

/** Commands aimed at ids that do not exist. */
function bogusCommand(w: World, rng: Rng): Command {
  const actor = rng.pick(ACTORS);
  const refusedOnly = { actor, allowed: false, apply: () => undefined };
  switch (rng.int(5)) {
    case 0:
      return {
        ...refusedOnly,
        name: 'addField',
        trace: `addField(${actor}, doc_nope)`,
        run: () => w.service.addField(actor, 'doc_nope', randomDraft(rng)),
      };
    case 1:
      return {
        ...refusedOnly,
        name: 'updateField',
        trace: `updateField(${actor}, fld_nope)`,
        run: () => w.service.updateField(actor, 'fld_nope', { label: 'Nope' }),
      };
    case 2:
      return {
        ...refusedOnly,
        name: 'removeField',
        trace: `removeField(${actor}, fld_nope)`,
        run: () => w.service.removeField(actor, 'fld_nope'),
      };
    case 3:
      return {
        ...refusedOnly,
        name: 'setValue',
        trace: `setValue(${actor}, fld_nope)`,
        run: () => w.service.setValue(actor, 'fld_nope', 'x'),
      };
    default:
      return {
        ...refusedOnly,
        name: 'send',
        trace: `send(${actor}, doc_nope)`,
        run: () => w.service.send(actor, 'doc_nope'),
      };
  }
}

function addFieldCommand(w: World, rng: Rng, doc: ModelDoc, actor: UserId): Command {
  const draft = randomDraft(rng);
  if (sentOrLater(doc) && actor === doc.senderId) coverage.senderLayoutWritesAfterSend += 1;
  return {
    name: 'addField',
    trace: `addField(${actor}, doc#${doc.n}, ${JSON.stringify({ ...draft, rect: undefined })})`,
    actor,
    doc,
    allowed: canEditLayoutRule(doc, actor),
    run: () => w.service.addField(actor, doc.id, draft),
    apply: (result) => {
      const field = result as Field;
      expect(field).toMatchObject({ ...draft, documentId: doc.id });
      doc.fields.push(field);
    },
  };
}

function updateFieldCommand(w: World, rng: Rng, doc: ModelDoc, actor: UserId, field: Field): Command {
  const patch = randomPatch(rng);
  if (sentOrLater(doc) && actor === doc.senderId) coverage.senderLayoutWritesAfterSend += 1;
  return {
    name: 'updateField',
    trace: `updateField(${actor}, doc#${doc.n}, ${field.label}, ${JSON.stringify(patch)})`,
    actor,
    doc,
    allowed: canEditLayoutRule(doc, actor),
    run: () => w.service.updateField(actor, field.id, patch),
    apply: (_result, after) => {
      const index = doc.fields.findIndex((f) => f.id === field.id);
      const updated = { ...field, ...patch };
      doc.fields[index] = updated;
      // The PRD does not say what happens to a value when its field changes type or owner.
      // It does say no recipient value exists in a draft, which is checked after every command.
      if (updated.type !== field.type || updated.assignee !== field.assignee) {
        if (!after?.values.some((v) => v.fieldId === field.id)) doc.values.delete(field.id);
      }
    },
  };
}

function removeFieldCommand(w: World, doc: ModelDoc, actor: UserId, field: Field): Command {
  if (sentOrLater(doc) && actor === doc.senderId) coverage.senderLayoutWritesAfterSend += 1;
  return {
    name: 'removeField',
    trace: `removeField(${actor}, doc#${doc.n}, ${field.label})`,
    actor,
    doc,
    allowed: canEditLayoutRule(doc, actor),
    run: () => w.service.removeField(actor, field.id),
    apply: () => {
      doc.fields = doc.fields.filter((f) => f.id !== field.id);
      doc.values.delete(field.id);
    },
  };
}

function randomValue(rng: Rng, type: FieldType, required: boolean): FieldValueContent | null {
  if (!required && rng.chance(0.4)) return rng.pick(INVALID_VALUES[type]);
  const kind = rng.next();
  if (kind < 0.7) return rng.pick(VALID_VALUES[type]);
  if (kind < 0.9) return rng.pick(INVALID_VALUES[type]);
  if (kind < 0.95) return '';
  return null;
}

function setValueCommand(w: World, rng: Rng, doc: ModelDoc, actor: UserId, field: Field): Command {
  const value = randomValue(rng, field.type, field.required);
  if (sentOrLater(doc) && actor === doc.senderId && field.assignee === 'sender') {
    coverage.senderValueWritesAfterSend += 1;
  }
  return {
    name: 'setValue',
    trace: `setValue(${actor}, doc#${doc.n}, ${field.label}/${field.type}, ${JSON.stringify(value)})`,
    actor,
    doc,
    allowed: canEditValueRule(doc, field, actor),
    run: () => w.service.setValue(actor, field.id, value),
    apply: () => {
      if (value === null || value === '') doc.values.delete(field.id);
      else doc.values.set(field.id, { value, filledBy: actor });
    },
  };
}

function setRecipientCommand(w: World, rng: Rng, doc: ModelDoc, actor: UserId): Command {
  const roll = rng.next();
  let input: RecipientInput;
  let inputValid = true;
  if (roll < 0.65) {
    input = { userId: rng.pick(ACTORS) };
  } else if (roll < 0.75) {
    input = { userId: 'u_nope' };
    inputValid = false;
  } else if (roll < 0.85) {
    const seeded = SEEDED_USERS[rng.pick(ACTORS)] as { email: string };
    input = { email: seeded.email };
  } else if (roll < 0.93) {
    input = { email: rng.pick(['bob@nowhere', 'no-at.example', 'a b@c.de', '']) };
    inputValid = false;
  } else {
    const email = w.freshEmail();
    input = rng.chance(0.5) ? { email, name: 'New Person' } : { email };
  }
  return {
    name: 'setRecipient',
    trace: `setRecipient(${actor}, doc#${doc.n}, ${JSON.stringify(input)})`,
    actor,
    doc,
    allowed: canEditLayoutRule(doc, actor) && inputValid,
    run: () => w.service.setRecipient(actor, doc.id, input),
    apply: (_result, after) => {
      const recipientId = after?.document.recipientId ?? null;
      expect(recipientId).not.toBeNull();
      doc.recipientId = recipientId;
      if ('userId' in input) expect(recipientId).toBe(input.userId);
      else if (recipientId) rememberRecipient(w, input, recipientId);
    },
  };
}

/** §7: an unknown email creates a user. The model learns the id and name from the repository. */
function rememberRecipient(
  w: World,
  input: { name?: string; email: string },
  recipientId: UserId,
): void {
  const seeded = Object.entries(SEEDED_USERS).find(([, u]) => u.email === input.email);
  if (seeded) expect(recipientId).toBe(seeded[0]);
  if (input.name && !w.names.has(recipientId)) w.names.set(recipientId, input.name);
  else if (!w.names.has(recipientId)) w.names.set(recipientId, '');
}

function fillAuto(w: World, doc: ModelDoc, party: Field['assignee'], actor: UserId, after: DocumentBundle) {
  for (const f of doc.fields.filter((x) => x.assignee === party && isAuto(x))) {
    let value: string = TODAY;
    if (f.type === 'signerName') {
      // A new user created without a name has no name the PRD can predict: read the stored one.
      value = w.names.get(actor) || (after.values.find((v) => v.fieldId === f.id)?.value as string);
    }
    doc.values.set(f.id, { value, filledBy: actor });
  }
}

/** True when the party's only unmet fields are optional ones holding an invalid value. */
function onlyOptionalInvalidBlocks(doc: ModelDoc, party: Field['assignee']): boolean {
  const unmet = unmetFields(doc, party);
  return unmet.length > 0 && unmet.every((f) => !f.required);
}

function sendCommand(w: World, doc: ModelDoc, actor: UserId): Command {
  const recipientReady =
    doc.recipientId !== null &&
    doc.recipientId !== doc.senderId &&
    doc.fields.some((f) => f.assignee === 'recipient');
  if (doc.status === 'draft' && actor === doc.senderId && recipientReady) {
    if (onlyOptionalInvalidBlocks(doc, 'sender')) coverage.optionalInvalidTransitions += 1;
  }
  return {
    name: 'send',
    trace: `send(${actor}, doc#${doc.n})`,
    actor,
    doc,
    allowed: sendAllowed(doc, actor),
    run: () => w.service.send(actor, doc.id),
    apply: (_result, after) => {
      doc.status = 'sent';
      fillAuto(w, doc, 'sender', actor, after as DocumentBundle);
      coverage.docsSent += 1;
    },
  };
}

function finishCommand(w: World, doc: ModelDoc, actor: UserId): Command {
  if (doc.status === 'sent' && actor === doc.recipientId) {
    if (onlyOptionalInvalidBlocks(doc, 'recipient')) coverage.optionalInvalidTransitions += 1;
  }
  return {
    name: 'finish',
    trace: `finish(${actor}, doc#${doc.n})`,
    actor,
    doc,
    allowed: finishAllowed(doc, actor),
    run: () => w.service.finish(actor, doc.id),
    apply: (_result, after) => {
      doc.status = 'completed';
      fillAuto(w, doc, 'recipient', actor, after as DocumentBundle);
      coverage.docsCompleted += 1;
    },
  };
}

function markViewedCommand(w: World, doc: ModelDoc, actor: UserId): Command {
  return {
    name: 'markViewed',
    trace: `markViewed(${actor}, doc#${doc.n})`,
    actor,
    doc,
    allowed: doc.status === 'sent' && actor === doc.recipientId && !doc.viewed,
    run: () => w.service.markViewed(actor, doc.id),
    apply: () => {
      doc.viewed = true;
    },
  };
}

function unmetFields(doc: ModelDoc, party: Field['assignee']): Field[] {
  return doc.fields.filter(
    (f) => f.assignee === party && !isAuto(f) && !satisfied(f, doc.values.get(f.id)?.value),
  );
}

/** The field holding up the next transition, required ones first. */
function blockingField(doc: ModelDoc): Field | undefined {
  const unmet = unmetFields(doc, doc.status === 'draft' ? 'sender' : 'recipient');
  return unmet.find((f) => f.required) ?? unmet[0];
}

/** Biased toward the next useful step, so most sequences get past draft and exercise the locks. */
function weightsFor(doc: ModelDoc): readonly (readonly [CommandName, number])[] {
  if (doc.status === 'draft') {
    const needsRecipient = doc.recipientId === null || doc.recipientId === doc.senderId;
    const needsRecipientField = !doc.fields.some((f) => f.assignee === 'recipient');
    const tryPastOptional = onlyOptionalInvalidBlocks(doc, 'sender');
    return [
      ['addField', needsRecipientField ? 7 : 2],
      ['updateField', 1],
      ['removeField', 0.5],
      ['setValue', blockingField(doc) ? 7 : 1],
      ['setRecipient', needsRecipient ? 6 : 0.5],
      ['send', tryPastOptional ? 8 : 2],
      ['finish', 0.3],
      ['markViewed', 0.3],
    ];
  }
  if (doc.status === 'sent') {
    return [
      ['addField', 1],
      ['updateField', 1],
      ['removeField', 1],
      ['setValue', 6],
      ['setRecipient', 1],
      ['send', 1],
      ['finish', onlyOptionalInvalidBlocks(doc, 'recipient') ? 10 : 3],
      ['markViewed', 1.5],
    ];
  }
  return [
    ['addField', 1],
    ['updateField', 1],
    ['removeField', 1],
    ['setValue', 2],
    ['setRecipient', 1],
    ['send', 1],
    ['finish', 1],
    ['markViewed', 1],
  ];
}

/** Mostly the person whose move it is, but the other party and outsiders get plenty of tries. */
function chooseActor(rng: Rng, doc: ModelDoc): UserId {
  if (doc.status === 'draft') return rng.chance(0.8) ? doc.senderId : rng.pick(ACTORS);
  const roll = rng.next();
  if (roll < 0.5) return doc.recipientId ?? doc.senderId;
  if (roll < 0.85) return doc.senderId;
  return rng.pick(ACTORS);
}

/** Drafts go after what blocks Send. Later on, half the tries land on the sender's locked fields. */
function chooseField(rng: Rng, doc: ModelDoc): Field {
  const blocker = blockingField(doc);
  if (blocker && rng.chance(doc.status === 'draft' ? 0.85 : 0.5)) return blocker;
  const senderFields = doc.fields.filter((f) => f.assignee === 'sender' && !isAuto(f));
  if (sentOrLater(doc) && senderFields.length > 0 && rng.chance(0.5)) return rng.pick(senderFields);
  return rng.pick(doc.fields);
}

function nextCommand(w: World, rng: Rng): Command {
  if (w.docs.length === 0 || rng.chance(0.04)) return createCommand(w, rng);
  if (rng.chance(0.04)) return bogusCommand(w, rng);

  const doc = rng.chance(0.75) ? (w.docs.at(-1) as ModelDoc) : rng.pick(w.docs);
  const actor = chooseActor(rng, doc);
  const name = rng.weighted(weightsFor(doc));

  if (name === 'addField') return addFieldCommand(w, rng, doc, actor);
  if (name === 'setRecipient') return setRecipientCommand(w, rng, doc, actor);
  if (name === 'send') return sendCommand(w, doc, actor);
  if (name === 'finish') return finishCommand(w, doc, actor);
  if (name === 'markViewed') return markViewedCommand(w, doc, actor);

  if (doc.fields.length === 0) return addFieldCommand(w, rng, doc, actor);
  const field = chooseField(rng, doc);
  if (name === 'updateField') return updateFieldCommand(w, rng, doc, actor, field);
  if (name === 'removeField') return removeFieldCommand(w, doc, actor, field);
  return setValueCommand(w, rng, doc, actor, field);
}

// ---- Invariants ----

const RANK: Record<DocumentStatus, number> = { draft: 0, sent: 1, completed: 2 };

const byId = <T extends { id: string }>(items: T[]) =>
  [...items].sort((a, b) => a.id.localeCompare(b.id));
const byFieldId = (items: FieldValue[]) =>
  [...items].sort((a, b) => a.fieldId.localeCompare(b.fieldId));

function expectModelMatches(doc: ModelDoc, b: DocumentBundle): void {
  expect(b.document).toMatchObject({
    id: doc.id,
    senderId: doc.senderId,
    recipientId: doc.recipientId,
    status: doc.status,
  });
  expect(b.document.sentAt === null).toBe(doc.status === 'draft');
  expect(b.document.completedAt === null).toBe(doc.status !== 'completed');
  expect(byId(b.fields)).toEqual(byId(doc.fields));
  const stored = byFieldId(b.values).map((v) => [v.fieldId, v.value, v.filledBy]);
  const modelled = [...doc.values.entries()]
    .sort(([a], [z]) => a.localeCompare(z))
    .map(([fieldId, v]) => [fieldId, v.value, v.filledBy]);
  expect(stored).toEqual(modelled);
  expect(b.events.map((e) => e.seq)).toEqual(b.events.map((_, i) => i + 1));
  expect(b.events.length).toBe(doc.eventCount);
}

/** §5: the rule that held the transition open still holds on the stored values. */
function expectTransitionWasValid(doc: ModelDoc, b: DocumentBundle, party: Field['assignee']): void {
  const actor = party === 'sender' ? doc.senderId : doc.recipientId;
  for (const f of b.fields.filter((x) => x.assignee === party)) {
    const stored = b.values.find((v) => v.fieldId === f.id);
    if (isAuto(f)) {
      expect(stored?.value).toBe(
        f.type === 'signerName' ? doc.values.get(f.id)?.value : TODAY,
      );
      expect(stored?.filledBy).toBe(actor);
    } else {
      expect(satisfied(f, stored?.value)).toBe(true);
    }
  }
}

function expectLocks(doc: ModelDoc, b: DocumentBundle): void {
  if (doc.status === 'draft') {
    // §5 edit table: nobody holds a recipient value while it is a draft.
    const recipientFields = new Set(
      b.fields.filter((f) => f.assignee === 'recipient').map((f) => f.id),
    );
    expect(b.values.filter((v) => recipientFields.has(v.fieldId))).toEqual([]);
  }
  if (doc.layoutAtSend) expect(byId(b.fields)).toEqual(doc.layoutAtSend);
  if (doc.senderValuesAtSend) {
    expect(byFieldId(senderValues(b))).toEqual(doc.senderValuesAtSend);
  }
  if (doc.bundleAtCompletion) expect(b).toEqual(doc.bundleAtCompletion);
}

function senderValues(b: DocumentBundle): FieldValue[] {
  const senderFields = new Set(b.fields.filter((f) => f.assignee === 'sender').map((f) => f.id));
  return b.values.filter((v) => senderFields.has(v.fieldId));
}

/** §5 and §7.5, for every user and every document. */
async function expectVisibility(w: World): Promise<void> {
  for (const user of ACTORS) {
    const listed = (await w.service.listDocumentsFor(user)).map((d) => d.id).sort();
    const expected = w.docs
      .filter((d) => canSee(d, user))
      .map((d) => d.id)
      .sort();
    expect(listed).toEqual(expected);
    for (const doc of w.docs) {
      if (canSee(doc, user)) {
        expect(await w.service.getDocumentFor(doc.id, user)).toEqual(await w.bundle(doc.id));
      } else {
        await expect(w.service.getDocumentFor(doc.id, user)).rejects.toBeInstanceOf(NotVisibleError);
      }
    }
  }
}

async function attempt(cmd: Command): Promise<{ threw: Error | null; result: unknown }> {
  try {
    return { threw: null, result: await cmd.run() };
  } catch (error) {
    const expectedKinds =
      error instanceof GuardError ||
      error instanceof NotVisibleError ||
      error instanceof NotFoundError;
    if (!expectedKinds) throw error;
    return { threw: error, result: undefined };
  }
}

async function step(w: World, cmd: Command): Promise<void> {
  w.advanceClock();
  const before = await w.allBundles();
  const usersBefore = await w.repo.listUsers();
  const docCountBefore = w.docs.length;

  const { threw, result } = await attempt(cmd);

  // markViewed is a silent no-op when refused; every other command throws.
  const beforeTarget = cmd.doc ? before.get(cmd.doc.id) : undefined;
  let accepted = threw === null;
  if (cmd.name === 'markViewed' && cmd.doc && beforeTarget) {
    accepted = (await w.bundle(cmd.doc.id)).events.length > beforeTarget.events.length;
  }

  coverage.commands += 1;
  const tally = accepted ? coverage.accepted : coverage.refused;
  tally[cmd.name] = (tally[cmd.name] ?? 0) + 1;

  expect(accepted, `${cmd.trace}: PRD says allowed=${cmd.allowed}`).toBe(cmd.allowed);

  if (!accepted) {
    // A refused command changes nothing, anywhere.
    expect(await w.allBundles()).toEqual(before);
    expect(await w.repo.listUsers()).toEqual(usersBefore);
    expect(w.docs.length).toBe(docCountBefore);
    if (threw instanceof GuardError) expect(threw.reasons.length).toBeGreaterThan(0);
  } else {
    if (cmd.name === 'createDocument') {
      cmd.apply(result, null);
    } else {
      const target = cmd.doc as ModelDoc;
      const after = await w.bundle(target.id);
      cmd.apply(result, after);
    }
    const target = cmd.doc ?? (w.docs.at(-1) as ModelDoc);
    const after = await w.bundle(target.id);
    const priorEvents = beforeTarget?.events ?? [];

    // Exactly one new event, appended to an untouched history (§7.4, §8).
    target.eventCount += 1;
    expect(after.events.length).toBe(priorEvents.length + 1);
    expect(after.events.slice(0, priorEvents.length)).toEqual(priorEvents);
    const event = after.events.at(-1);
    expect(event).toMatchObject({
      documentId: target.id,
      seq: priorEvents.length + 1,
      actorId: cmd.actor,
      type: EVENT_TYPE[cmd.name],
      prevHash: priorEvents.at(-1)?.hash ?? '0'.repeat(64),
    });

    // Status only moves forward, one step at a time (§5).
    const from = beforeTarget?.document.status ?? 'draft';
    expect(RANK[after.document.status] - RANK[from]).toBeGreaterThanOrEqual(0);
    expect(RANK[after.document.status] - RANK[from]).toBeLessThanOrEqual(1);
    const moved = after.document.status !== from;
    expect(moved).toBe(cmd.name === 'send' || cmd.name === 'finish');

    // Every other document is untouched.
    for (const [id, bundle] of before) {
      if (id !== target.id) expect(await w.bundle(id)).toEqual(bundle);
    }

    if (cmd.name === 'send') {
      expectTransitionWasValid(target, after, 'sender');
      target.layoutAtSend = byId(after.fields);
      target.senderValuesAtSend = byFieldId(senderValues(after));
    }
    if (cmd.name === 'finish') {
      expectTransitionWasValid(target, after, 'recipient');
      target.bundleAtCompletion = after;
    }
  }

  for (const doc of w.docs) {
    const b = await w.bundle(doc.id);
    expectModelMatches(doc, b);
    expectLocks(doc, b);
  }
  if (cmd.doc || accepted) {
    const target = cmd.doc ?? (w.docs.at(-1) as ModelDoc);
    expect(await w.audit.verify(target.id)).toEqual({ ok: true });
  }
  await expectVisibility(w);
}

async function runSequence(seed: number): Promise<void> {
  const rng = new Rng(seed);
  const w = new World();
  const length = 25 + rng.int(MAX_COMMANDS - 25 + 1);
  const trace: string[] = [];
  for (let i = 0; i < length; i++) {
    const cmd = nextCommand(w, rng);
    trace.push(`${i}: ${cmd.trace}`);
    try {
      await step(w, cmd);
    } catch (error) {
      throw new Error(
        `seed ${seed} failed at command ${i}\n${trace.join('\n')}\n\n${String(error)}`,
        { cause: error },
      );
    }
  }
  coverage.sequences += 1;
}

describe('random command sequences (PRD §5, §7, §8)', () => {
  const seeds = Array.from({ length: SEQUENCE_COUNT }, (_, i) => 1000 + i * 7);

  it.each(seeds)('seed %i holds every invariant', async (seed) => {
    await runSequence(seed);
  });

  it('the sequences really exercised each command, both ways', ({ skip }) => {
    // Under a -t filter only some sequences ran, so the totals mean nothing.
    if (coverage.sequences < SEQUENCE_COUNT) skip();
    const commands: CommandName[] = ['addField', 'updateField', 'removeField', 'setValue', 'setRecipient', 'send', 'finish', 'markViewed'];
    for (const name of commands) {
      expect(coverage.accepted[name] ?? 0, `accepted ${name}`).toBeGreaterThanOrEqual(30);
      expect(coverage.refused[name] ?? 0, `refused ${name}`).toBeGreaterThanOrEqual(30);
    }
    expect(coverage.accepted.createDocument ?? 0).toBeGreaterThanOrEqual(30);
    expect(coverage.refused.createDocument ?? 0).toBeGreaterThanOrEqual(5);
    expect(coverage.docsSent).toBeGreaterThanOrEqual(60);
    expect(coverage.docsCompleted).toBeGreaterThanOrEqual(30);
    expect(coverage.senderValueWritesAfterSend).toBeGreaterThanOrEqual(30);
    expect(coverage.senderLayoutWritesAfterSend).toBeGreaterThanOrEqual(30);
    expect(coverage.optionalInvalidTransitions).toBeGreaterThanOrEqual(10);
  });
});
