# PRD: MiniSign, a document signing app

This PRD is the single source of truth for the build. It restates every requirement from the original brief, so the brief is not needed in the repo. Where this PRD and anything else disagree, this PRD wins.

---

## 0. How to run this PRD

**Session setup (Evan does this once):**

```
/effort ultracode
/goal Every item in PRD.md §13 "Definition of Done" is met, and the lead has printed the §13.3 verification report with real command output as evidence for each item.
```

**Repo setup before the first prompt:**

- Empty folder with `PRD.md` at the root.
- The sample PDF copied to `public/sample/master-agreement.pdf`.
- Nothing else. Do not add the original take-home brief to the repo.

**Roles.**

- **Lead agent.** This is the session that receives `/goal`. It acts as project manager and integrator. It owns `main`, the contracts (§9.1), merges, the reviews, and the final report. The lead writes contract code only. Features are built by builders.
- **Builder agents.** These are spawned by the lead, and each one owns one lane (§12). A builder works in its own git worktree on its own branch, and only touches the files its lane owns.
- **Reviewer agent.** This is a fresh agent that has not seen the build. It audits the integrated app against §13 and §14 (§12, Phase 4).

**Budget.** There is no token budget and no cap on agent count. Spend wherever it raises quality: more parallel builders, a second reviewer, and re-running a lane that came back weak are all fine.

**Reporting to Evan.** Keep it plain English and short. Lead with the verdict, then say what was exercised. Do not explain internals unless he asks.

---

## 1. Product summary

This is a simplified DocuSign in React.

1. A **sender** picks a source document (a PDF) and places **fields** on its pages, by hand or with **Auto-prep**.
2. The sender fills in and signs their own fields, then **sends** the document to a **recipient**.
3. The recipient opens it, fills in their fields, signs, and **finishes**.
4. Both people can see the status at all times: `draft` → `sent` → `completed`.
5. A user switcher lets anyone act as any seeded user. Each user sees only the documents they sent or received.

There is no real backend, real auth or real email. Persistence is `localStorage` behind an async repository.

**What the reviewer scores**, in this order of weight. This drives every design decision:

| Area | What they look for |
|---|---|
| Data modeling | A clean split between the source document, the field layout, and the filled-in values; status changes that make sense |
| Field positioning | Positions that survive resizing; a sensible coordinate model (page plus relative position) |
| State and data flow | A sensible place for state to live; no tangled prop drilling; no duplicated sources of truth |
| Part 2 feature | A sensible choice, cleanly separated from the core, that would hold up as the app grows |
| Correctness | Validation; sender and recipient each edit only their own fields; locked documents really are locked; users see only their own documents |
| Communication | A write-up that explains the reasoning and trade-offs |

They do **not** score visual design or pixel-perfect placement. Tests are a plus. Do not spend effort on visual polish beyond clean and legible.

---

## 2. Users and seed data

Seed these on first load, when the repository is empty.

| id | name | email | Role in demos |
|---|---|---|---|
| `u_dana` | Dana Reyes | dana@lonestarfleet.example | Sender at Lone Star Fleet Services |
| `u_bob` | Bob Smith | bob@acmetrucking.example | Customer |
| `u_maria` | Maria Lopez | maria@coastalfreight.example | Customer |

Users have no role column. "Sender" and "recipient" are roles **per document**, so the same user can send one document and receive another.

Seed one source document: **"Lone Star Fleet Services: Master Agreement"**, pointing to `/sample/master-agreement.pdf`, 2 pages, each 612 × 792 pt.

Seed **no** documents (envelopes). Every demo starts from a clean flow. Provide a "Reset demo data" action in the header menu that clears storage and re-seeds.

---

## 3. Data model

There are five core tables and one supporting table. They are expressed as TypeScript types in `src/domain/types.ts`, and that file is the contract (§9.1).

```ts
type UserId = string; type SourceDocumentId = string; type DocumentId = string;
type FieldId = string; type AuditEventId = string;

interface User { id: UserId; name: string; email: string }

/** The blank, never-modified PDF. "Templates" in planning conversations. */
interface SourceDocument {
  id: SourceDocumentId;
  title: string;
  fileUrl: string;            // static path, or data: URL for uploads
  pageCount: number;
  pageSizes: { widthPt: number; heightPt: number }[]; // index 0 = page 1
}

type DocumentStatus = 'draft' | 'sent' | 'completed';

/** One copy of a source document being sent to one recipient (an "envelope"). */
interface Document {
  id: DocumentId;
  sourceDocumentId: SourceDocumentId;
  title: string;
  senderId: UserId;
  recipientId: UserId | null;  // null until sent
  status: DocumentStatus;
  createdAt: string;           // ISO
  sentAt: string | null;
  completedAt: string | null;
}

type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';
type Assignee = 'sender' | 'recipient';

/** The layout: one placed box. Never holds a value. */
interface Field {
  id: FieldId;
  documentId: DocumentId;
  type: FieldType;
  label: string;
  required: boolean;
  assignee: Assignee;
  page: number;                // 1-based
  rect: NormalizedRect;        // see §4
  autoFillSigningDate: boolean; // meaningful only for type 'date'
  origin: 'manual' | 'autoprep';
}

interface NormalizedRect { x: number; y: number; w: number; h: number } // all 0..1

type SignatureValue =
  | { kind: 'typed'; text: string }
  | { kind: 'drawn'; pngDataUrl: string };

/** What was filled in. Primary key = fieldId (a field has at most one value). */
interface FieldValue {
  fieldId: FieldId;
  documentId: DocumentId;      // denormalized for loading values per document
  value: string | SignatureValue;
  filledBy: UserId;
  filledAt: string;
}

/** Append-only, hash-chained (see §8). */
interface AuditEvent {
  id: AuditEventId;
  documentId: DocumentId;
  seq: number;                 // 1..n per document
  actorId: UserId;
  type: AuditEventType;
  at: string;
  data: Record<string, unknown>; // small, JSON-safe
  prevHash: string;            // '0'.repeat(64) for seq 1
  hash: string;                // SHA-256 hex
}

type AuditEventType =
  | 'document.created' | 'field.added' | 'field.updated' | 'field.removed'
  | 'autoprep.suggested' | 'autoprep.accepted' | 'autoprep.rejected'
  | 'document.sent' | 'document.viewed' | 'document.completed';
```

**Rules the model enforces**

- A `Field` belongs to exactly one `Document` (foreign key `documentId`). Field IDs are globally unique, so a second document's "Email" box is a different field with a different ID.
- `FieldValue` is keyed by `fieldId`. Editing a value replaces it, and the edit history lives in the audit log, not in old value rows.
- `Document.status` is the only stored status. The rules for moving between statuses are code (§5), not data.
- No fact is stored twice. Examples: the customer's company name lives only in the "Customer Legal Name" value, never on `User`, and the signer's name for `signerName` comes from `User.name` at signing time and is written once into that field's value.
- IDs are `crypto.randomUUID()` with a readable prefix (`doc_`, `fld_`, `evt_`).
- Out of scope: a `TemplateField` table for reusable layouts. See §11, which says how it would plug in.

---

## 4. Field positioning

**Decision.** Positions are stored as **fractions of the page**: page number plus `{x, y, w, h}` in 0..1, with the origin at the page's top-left. `x` and `w` are fractions of the page width, and `y` and `h` are fractions of the page height.

- **Rendering.** Each page is wrapped in a `position: relative` container that is exactly the size of the rendered page. A field is `position: absolute` with `left: x*100%`, `top: y*100%`, `width: w*100%` and `height: h*100%`. That means no JavaScript runs on resize, and fields scale with the page by construction.
- **Interaction.** Pointer coordinates are converted to fractions using the page container's live `getBoundingClientRect()`, so drag and resize stay correct at any zoom or window width. Clamp so that `0 ≤ x`, `x + w ≤ 1`, and the same for y and h. The minimum size is `w ≥ 0.02` and `h ≥ 0.012`.
- **Value text** inside a field scales with the field. Use a font size derived from the rendered field height (for example, a CSS container query unit, or a measured height times a factor). It must not be a fixed pixel size.
- **One module owns all conversions:** `src/domain/geometry.ts`. That covers `toNormalized(pointerPx, pageRectPx)`, `fromPdfPoints(rectPt, pageSizePt)`, `toPdfPoints(...)` and `clampRect(...)`. Nothing else does coordinate arithmetic.
- **The write-up must state the trade-off.** Industry tools such as DocuSign store positions in PDF points from the page origin. Fractions and points are the same idea (anchored to the page, not the screen) and convert by dividing by the page size. Fractions were chosen because they make rendering trivial. Points become the better fit when values are stamped into a real PDF, and `toPdfPoints` already exists for that.

---

## 5. Status rules (the state machine)

There are exactly two transitions. Nothing moves backwards, and nothing skips a step.

| From | To | Who | Allowed only when |
|---|---|---|---|
| `draft` | `sent` | the document's sender | a recipient is chosen; the recipient ≠ the sender; the document has ≥ 1 recipient field; every **sender** field that is required and not auto-filled has a valid value |
| `sent` | `completed` | the document's recipient | every **recipient** field that is required and not auto-filled has a valid value |

**Edit permissions**, which one pure function owns:

| Status | Layout (add/move/resize/delete/edit field props) | Sender's values | Recipient's values | Who can see it |
|---|---|---|---|---|
| `draft` | sender only | sender only | nobody | sender only |
| `sent` | nobody | nobody (locked) | recipient only | sender + recipient |
| `completed` | nobody | nobody | nobody | sender + recipient |

**Auto-fill on transition.**

- **On Send**, every sender `signerName` field is set to `sender.name`, and every sender `date` field with `autoFillSigningDate` is set to today's date.
- **On Finish**, the same is done for recipient fields, using `recipient.name` and today's date.
- Auto-filled fields are excluded from "required and valid" checks before the transition, and they are written in the same atomic save as the status change.
- In draft and sent, auto-fill fields show a placeholder: "Fills in on signing".

**Where the rules live.**

- `src/domain/stateMachine.ts` holds `canTransition(doc, to, actor, fields, values) → { ok: true } | { ok: false; reasons: string[] }`.
- `src/domain/permissions.ts` holds `canView`, `canEditLayout` and `canEditValue(doc, field, actor)`.
- These are pure functions with no React and no storage.
- **The UI calls the same guards** to disable buttons and list the reasons ("Signature is required", "Choose a recipient"). The **service calls them again** before every write and rejects the call if they fail. The UI is never the only lock.

---

## 6. Validation

All validators live in `src/domain/validation.ts`, and they are pure functions.

| Type | Valid when |
|---|---|
| `text` | non-empty after trim (if required) |
| `email` | matches a pragmatic pattern: one `@`, non-empty local part, a domain with a dot, no spaces |
| `phone` | after stripping spaces, dashes, dots and parentheses: optional leading `+`, then 7–15 digits |
| `date` | a real calendar date (ISO `YYYY-MM-DD` stored; the native date input is fine) |
| `signature` | typed: ≥ 2 non-space chars; drawn: the canvas is not empty |
| `signerName` | always auto-filled; never user-edited |

- An optional field that is empty is valid. An optional field that is non-empty must still pass its type check (for example, a bad fax number is rejected).
- Show errors inline on the field, plus a summary list beside the Send or Finish button. Clicking an error scrolls to and focuses that field.

---

## 7. Architecture and data flow

**Layers.** Arrows show the only allowed direction of import.

```
UI components (src/features/*, src/components/*)
      │  read via selectors, call actions
      ▼
Store (Zustand, src/store/)            ← UI state + a cache of the repository, never the truth
      │  calls commands
      ▼
Services (src/services/)               ← the "bouncer": runs domain guards, writes, appends audit events
      │                 │
      ▼                 ▼
Domain (src/domain/)    Repository interface (src/data/repository.ts)
pure TS, no I/O               │
                              ▼
                  LocalStorageRepository (src/data/localStorageRepository.ts)
```

**Rules**

1. **The repository is the single source of truth.** The store caches what the repository returned, and after every command it re-reads the affected document from the repository. Components never edit cached data directly.
2. **All repository methods are `async`** and return copies (structured clone), just as a network call would. Swapping in a real API means one new class implementing `Repository`, and no screen changes.
3. **Only services write.** No component or store action calls the repository's write methods directly.
4. **Every successful command appends exactly one audit event** (or a batch, for bulk accepts) through `AuditLog.append`, inside the same save as the change itself.
5. **Visibility is enforced in the service.** The service functions `listDocumentsFor(userId)` and `getDocumentFor(docId, userId)` throw `NotVisibleError` if the user is neither sender nor recipient, or if the user is the recipient while the document is a draft. The documents list and the document route both go through these.
6. **Prop drilling stops at one level.** Components read `currentUserId`, the active document bundle and the selection from the store via selectors. Props carry only what is local, such as the field object a `FieldBox` renders.
7. **No duplicate truth in UI state.** For example, "is this field editable" is always computed with `permissions.canEditValue`, never stored.

**Repository interface** (contract; the exact names may be refined in Phase 0 but must be frozen before Phase 2):

```ts
interface Repository {
  listUsers(): Promise<User[]>;
  getUser(id: UserId): Promise<User | null>;
  upsertUser(u: User): Promise<void>;
  listSourceDocuments(): Promise<SourceDocument[]>;
  getSourceDocument(id): Promise<SourceDocument | null>;
  addSourceDocument(s: SourceDocument): Promise<void>;
  listDocumentsForUser(userId): Promise<Document[]>;   // raw filter; service applies visibility rules
  getDocumentBundle(id): Promise<{ document; fields; values; events } | null>;
  saveDocumentBundle(change: BundleChange): Promise<void>; // atomic: doc + fields + values + new events
  reset(): Promise<void>;
}
```

`localStorage` is stored under one versioned key, `minisign:v1`, as a single JSON object. `saveDocumentBundle` read-modify-writes that object in one `setItem`, which makes it atomic for a single tab.

**Services** (contract):

```ts
DocumentService:
  createDocument(actorId, sourceDocumentId) → Document
  addField(actorId, docId, draft: Omit<Field,'id'|'documentId'>) → Field
  updateField(actorId, fieldId, patch) → Field
  removeField(actorId, fieldId)
  setValue(actorId, fieldId, value)
  setRecipient(actorId, docId, recipient: { userId } | { name?: string; email: string })  // creates a User if the email is new
  send(actorId, docId)          // runs canTransition; auto-fills; status → sent; event
  markViewed(actorId, docId)    // first open by recipient while sent; idempotent
  finish(actorId, docId)        // runs canTransition; auto-fills; status → completed; event
  listDocumentsFor(userId), getDocumentFor(docId, userId)
AutoPrepService:  see §10
AuditLog:
  append(docId, actorId, type, data) → AuditEvent   // computes seq, prevHash, hash
  verify(docId) → { ok: true } | { ok: false; brokenAtSeq: number }
```

**Store (Zustand)** holds the following:

- `currentUserId`, persisted separately under the key `minisign:session`.
- The `documentsList` cache.
- `activeBundle` (document, fields, values, events, plus the source doc).
- UI-only state: `selectedFieldId`, `editorMode: 'layout' | 'fill'`, the pending Auto-prep suggestions, and modal state.
- Actions that call services, then refresh.

Switching user clears the active bundle and navigates to the list.

**Routing.** Use `react-router-dom` with these routes: `/` for the documents list, `/documents/:id` for the document screen (which renders editor, signing or read-only from the status, role and permissions), and `/new` for picking a source document.

---

## 8. Audit log (core infrastructure)

- **Every** command in §7 appends one event, and events are never updated or deleted. The repository exposes no method that edits or removes an event.
- **Hash chain:** `hash = SHA-256(canonicalJSON({ documentId, seq, actorId, type, at, data, prevHash }))` via Web Crypto `crypto.subtle.digest`. Canonical JSON means sorted keys and no whitespace. Seq 1 uses `prevHash = 64 zeros`.
- `verify(docId)` recomputes the chain and reports the first broken seq.
- **UI:** the document screen has an "Activity" panel listing events in plain words ("Dana Reyes sent this to Bob Smith · 3:04 PM"), with an integrity badge: "History intact ✓" or "History altered at event #N".
- **Dev affordance**, for demonstrating tamper detection: available when `import.meta.env.DEV` is true or `?debug=1` is in the URL, a "Tamper with history (demo)" button edits one stored event in `localStorage` directly, bypassing the service. The badge must then flip.
- **Write-up framing:** the log is part of the core architecture. It is how the bouncer records every decision, so it is not presented as the Part 2 feature.

---

## 9. Code organization

```
src/
  domain/          types.ts  geometry.ts  validation.ts  stateMachine.ts  permissions.ts
                   autofill.ts  canonicalJson.ts  hashChain.ts  errors.ts
  data/            repository.ts  localStorageRepository.ts  seed.ts  memoryRepository.ts (tests)
  services/        documentService.ts  auditLog.ts  autoPrepService.ts  container.ts (wires instances)
  features/
    documents/     DocumentsList.tsx  NewDocument.tsx  StatusBadge.tsx
    viewer/        PdfDocumentView.tsx  PageSurface.tsx  FieldLayer.tsx
    layout-editor/ FieldPalette.tsx  FieldBox.tsx  useDragResize.ts  FieldInspector.tsx  RecipientPicker.tsx
    filling/       FieldInput.tsx  SignatureModal.tsx  ValidationSummary.tsx  SendBar.tsx  FinishBar.tsx
    autoprep/      detectors/  pageContent/  classify/  SuggestionLayer.tsx  AutoPrepButton.tsx
    activity/      ActivityPanel.tsx
    session/       UserSwitcher.tsx  Header.tsx
  store/           useAppStore.ts  selectors.ts
  App.tsx  main.tsx
tests/
  unit/            (Vitest, mirrors src/)
  fixtures/        masterAgreement.expected.ts  synthetic-underline-form.pdf  generateSyntheticPdf.ts
  e2e/             (Playwright)
docs/              WRITEUP.md (also copied to repo root)  screenshots/  ai-usage-log.md
```

### 9.1 Contracts (frozen by the lead in Phase 0, before any builder starts)

- `src/domain/types.ts` (all of §3)
- `src/data/repository.ts` (the interface)
- The service signatures (§7), as typed function stubs that throw `NotImplemented`
- The store shape and action names (`src/store/useAppStore.ts`, as a typed skeleton)
- `src/domain/geometry.ts` signatures
- The Auto-prep interfaces (§10.2)

A builder who needs a contract change does not edit the contract. They write the request in their lane report, and the lead decides and updates `main`.

---

## 10. Part 2 feature: Auto-prep

### 10.1 What it does

Auto-prep is a button in the layout editor. When clicked, the app reads the PDF's own text and drawn table lines, finds where fields belong, and proposes them as **suggestions**: dashed boxes, each with its type, label, assignee and required flag already guessed.

The sender then works through the suggestions:

- **Accept** or **reject** each one, or use **Accept all** or **Reject all**.
- Click a suggestion to edit its type, label, assignee or required flag before accepting.
- Accepted suggestions become ordinary `Field`s with `origin: 'autoprep'`, and from there they are edited, dragged and deleted like any other field.
- Suggestions that overlap an existing field (IoU > 0.5) are not proposed again.

No AI or network calls are involved. It is deterministic and runs entirely in the browser.

**Why this feature** (the write-up states this): on every new customer document, placing boxes by hand is the slowest and most error-prone step. Auto-prep cuts it to a review. It is designed as a **pluggable system**:

- Detectors behind an interface.
- A pure core that can be tested without a browser.
- A suggestion step that keeps a human in control.

So a smarter detector, such as text recognition for scanned PDFs or a model, can later be added without touching the editor.

### 10.2 Design (contracts)

```ts
/** Everything a detector may look at, already normalized to 0..1 page space. */
interface PageContent {
  page: number;
  words: { text: string; rect: NormalizedRect; fontSize: number }[]; // from pdf.js getTextContent
  rules: { x1: number; y1: number; x2: number; y2: number }[];       // horizontal/vertical stroked lines
  shadedRects: NormalizedRect[];                                      // filled rects (header bands)
}

interface FieldSuggestion {
  page: number; rect: NormalizedRect; label: string;
  type: FieldType; assignee: Assignee; required: boolean; autoFillSigningDate: boolean;
  confidence: number;        // 0..1
  detector: string;          // which detector produced it
  evidence: string;          // e.g. 'label "Email:" in ruled cell r2c2'
}

interface FieldDetector { name: string; detect(pages: PageContent[]): FieldSuggestion[] }
```

**Pipeline**

1. **Extraction adapter** (`autoprep/pageContent/pdfjsPageContent.ts`). This is the only code that touches pdf.js.
   - Words come from `page.getTextContent()`, with the transform converted to a top-left normalized rect.
   - Rules and shaded rects come from `page.getOperatorList()`: walk the path-construction and stroke/fill ops, applying the current transform matrix.
   - If operator parsing proves unreliable on the installed pdf.js version, fall back to rasterizing the page to an offscreen canvas and scanning for long dark horizontal and vertical runs. The output contract is the same either way.
2. **Detectors**, all pure functions:
   - **`RuledCellDetector`**: build the grid of cells from `rules`. A cell whose top-left holds a label word sequence becomes a field. The rect is the cell interior below the label line, inset 1.5% of the cell size. This is what the sample document needs, because its labels are small captions in the top-left corner of each ruled cell, and the writing space is the cell itself.
   - **`LabelGapDetector`**, for unruled `Label: ________` layouts. A word sequence ending in `:` is a label. The field runs from just after the label to the next word on the same baseline, or to the right margin of the text column. An underline rule directly under that span snaps the rect to the rule. Height = 1.4 × the line height.
   - **`CompositeDetector`** runs both and de-duplicates by IoU > 0.5, keeping the higher confidence.
3. **Classifiers**, all pure and table-driven, in `autoprep/classify/`. The keyword table lives in one file.
   - **Type** (from the label, case-insensitive):
     - `email|e-mail` → `email`
     - `phone|tel|mobile|cell|fax` → `phone`
     - `signature|sign here` → `signature`
     - `date` → `date`
     - `print name|printed name|name` → `signerName` **only if** the label shares a signature block (same ruled table, or within a few lines) with a `signature` suggestion; otherwise `text`
     - everything else → `text`
     - A `date` in a signature block gets `autoFillSigningDate: true`.
   - **Assignee:** find the nearest header above the field in its column. That is a shaded band, a bold heading, or the first row of a ruled table.
     - If the header matches the recipient lexicon (`customer|client|recipient|buyer|purchaser|tenant|lessee|signer|employee|applicant`) → `recipient`.
     - In a two-column signature block, the column whose header does **not** match → `sender`.
     - Default → `recipient`. The sender can flip any of these.
   - **Required:** `true` by default. It is `false` when the label contains `fax`, `optional`, `(if any)` or `secondary`.
   - **Label:** the caption text with the trailing colon removed, title-cased ("Print signer's title" → "Title" when it is in a signature block; otherwise kept).
4. **`AutoPrepService.suggest(actorId, docId)`** checks `canEditLayout`, extracts the pages, runs the detector and filters out overlaps. It appends `autoprep.suggested` (with a count), and returns the suggestions to the store. Suggestions are UI state, not persisted. `accept(actorId, docId, suggestions[])` creates fields through `DocumentService.addField`, then appends `autoprep.accepted`. `reject` just appends `autoprep.rejected` with a count.

### 10.3 Ground truth for the sample (the acceptance test fixture)

These are cell bounds in PDF points (top-left origin, page 612 × 792), measured from the file. A suggestion passes if its type, assignee and page match, and its rect lies inside the cell, with IoU ≥ 0.5 against the cell area below the label line.

The "Below label from y" column marks where the label caption ends inside each cell. On page 1 that is the cell top + 8.5 pt. On page 2 it is the label's bottom edge.

| Page | Label | Type | Assignee | Required | Cell x0–x1 | Cell y0–y1 | Below label from y |
|---|---|---|---|---|---|---|---|
| 1 | Customer Legal Name | text | recipient | yes | 54–558 | 116.4–136.4 | 124.9 |
| 1 | Purchasing Agent | text | recipient | yes | 54–255.6 | 136.4–156.4 | 144.9 |
| 1 | Email | email | recipient | yes | 255.6–558 | 136.4–156.4 | 144.9 |
| 1 | Address | text | recipient | yes | 54–255.6 | 156.4–176.4 | 164.9 |
| 1 | City | text | recipient | yes | 255.6–406.8 | 156.4–176.4 | 164.9 |
| 1 | State | text | recipient | yes | 406.8–482.4 | 156.4–176.4 | 164.9 |
| 1 | Zip | text | recipient | yes | 482.4–558 | 156.4–176.4 | 164.9 |
| 1 | Phone | phone | recipient | yes | 54–255.6 | 176.4–196.4 | 184.9 |
| 1 | Fax | phone | recipient | **no** | 255.6–558 | 176.4–196.4 | 184.9 |
| 2 | Signature | signature | sender | yes | 54–306 | 392.9–426.9 | 401.1 |
| 2 | Print Name | signerName | sender | yes | 54–217.8 | 426.9–448.9 | 435.1 |
| 2 | Date | date (auto) | sender | yes | 217.8–306 | 426.9–448.9 | 435.1 |
| 2 | Title | text | sender | yes | 54–306 | 448.9–470.9 | 457.1 |
| 2 | Signature | signature | recipient | yes | 306–558 | 392.9–426.9 | 401.1 |
| 2 | Print Name | signerName | recipient | yes | 306–469.8 | 426.9–448.9 | 435.1 |
| 2 | Date | date (auto) | recipient | yes | 469.8–558 | 426.9–448.9 | 435.1 |
| 2 | Title | text | recipient | yes | 306–558 | 448.9–470.9 | 457.1 |

**Header bands:**

- Page 1: "Customer Information", y 100.4–116.4.
- Page 2: "LONE STAR FLEET SERVICES" (x 54–306) and "Customer" (x 306–558), y 376.9–392.9.
- Page 2 also has a short decorative rule at y 334.6 (x 72–211.5), under the email link. That rule is **not** a field, and the detector must ignore it.

**Required result:**

- Exactly these 17 suggestions, with no others.
- The body text on both pages produces zero suggestions. It contains colons ("the following:") and that must not trigger a field. Captions qualify only when they sit inside a ruled cell or match a `Label:` pattern with an empty span after them.

### 10.4 Proving it is general (not hard-coded to the sample)

- `tests/fixtures/generateSyntheticPdf.ts` uses `pdf-lib` (a dev dependency) to generate `synthetic-underline-form.pdf`. This is a different layout:
  - unruled `Label: ________` lines (Full name, E-mail, Mobile, Start date, Notes)
  - a two-column signature area headed "Company" and "Employee", with "Sign here:" / "Date:" under each
  - and a paragraph containing colons.
- The generator also emits the expected suggestions.
- A unit test runs the full detector stack on both PDFs and must pass on both.
- Add a test that **would fail** if the detector were hard-coded: run on the sample with its pages swapped, and expect page numbers to swap accordingly.

### 10.5 Upload

`NewDocument` lets the sender either pick the seeded source document or upload a PDF.

- An upload is stored as a `data:` URL through `repository.addSourceDocument`, with a 3 MB limit and a clear error over it.
- Page count and sizes are read with pdf.js at upload.
- This is what lets Auto-prep be shown on a document the app has never seen.
- Write-up trade-off: `localStorage` has roughly a 5 MB quota. IndexedDB or a real file store would replace it behind the same repository.

---

## 11. Explicitly not building (each with its reason, for the write-up)

| Item | Reason / how it would plug in |
|---|---|
| Templates (saved layouts) | A `TemplateField` table shaped like `Field` but keyed to `sourceDocumentId`; "Save as template" copies fields out, and "New from template" copies them in with fresh IDs. The model already supports it, and it adds screens more than design. |
| Notifications, reminders, expiry | Would subscribe to audit events; the log is already the event stream |
| Real backend, auth, email | Out of scope by the brief; the async repository is the seam |
| Exporting a flattened signed PDF | Next step after this build: `toPdfPoints` + `pdf-lib` stamping. Listed as unfinished. |
| Multiple recipients, signing order | The model is one recipient per document by design |
| Mobile layout | Desktop-first; the resize correctness is still tested at narrow widths |

Do not build these. Do list them honestly in the write-up's "What's unfinished".

---

## 12. Build plan: lead, lanes, merge

### Phase 0: Foundation (the lead works alone, then commits to `main`)

1. Scaffold with Vite + React + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`). Add ESLint, Prettier, Vitest + React Testing Library + jsdom, and Playwright with Chromium.
2. Install the runtime dependencies (§15).
3. Configure the pdf.js worker for Vite, per the react-pdf docs for the installed version.
4. Write every contract in §9.1, as compiling stubs.
5. Add `memoryRepository.ts` (in-memory `Repository`) so that service tests and UI lanes can run without `localStorage`.
6. Add npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:e2e`, `verify` (= typecheck + lint + test + build + test:e2e).
7. Write `docs/ai-usage-log.md` with a header, and the lane-ownership table below into `docs/LANES.md`.
8. Commit, then create one worktree and branch per lane from this commit.

### Phase 1: Parallel lanes (each builder in its own worktree and branch)

| Lane | Owns (may edit) | Delivers | Must not touch |
|---|---|---|---|
| **A: Domain & services** | `src/domain/**` (non-contract files), `src/data/localStorageRepository.ts`, `src/data/seed.ts`, `src/services/**` | validation, state machine, permissions, autofill, canonical JSON, hash chain, LocalStorageRepository, DocumentService, AuditLog, the container; unit tests for every guard in §13.1 | `src/features/**`, `src/store/**` |
| **B: Viewer & layout editor** | `src/features/viewer/**`, `src/features/layout-editor/**`, `src/domain/geometry.ts` (implementation) | react-pdf page rendering inside a `PageSurface`; FieldLayer; click-to-place from the palette; drag to move; corner handle to resize; the inspector (label, type, required, assignee, date auto-fill, delete); keyboard Delete; RecipientPicker; geometry unit tests | services, filling, autoprep |
| **C: Filling, signing, shell** | `src/features/filling/**`, `src/features/documents/**`, `src/features/session/**`, `src/features/activity/**`, `src/store/**` (implementation), `App.tsx`, routing | FieldInput per type; the signature modal (Type tab in a script font, Draw tab via react-signature-canvas, Clear, Apply); ValidationSummary; SendBar and FinishBar wired to the guards; the read-only render; the documents list with status badge and a "Needs your action" marker; the user switcher; the Activity panel with the integrity badge | domain logic, autoprep internals |
| **D: Auto-prep** | `src/features/autoprep/**`, `src/services/autoPrepService.ts`, `tests/fixtures/**` | the extraction adapter, detectors, classifiers, the synthetic PDF generator, the ground-truth fixture from §10.3, SuggestionLayer (dashed boxes, accept/reject/edit, accept-all/reject-all), the AutoPrep button, the upload flow in NewDocument (coordinate with C via the lead), unit tests in §10.3–10.4 | the layout editor internals (D renders its own layer on top of PageSurface through the FieldLayer slot defined in the contract) |

**Lane rules**

- Build against the contracts. Lanes B, C and D use `memoryRepository` and the service stubs (or Lane A's implementation once merged) for local testing.
- Each lane ends with its own `npm run typecheck && npm run lint && npm test` green on its branch.
- Each lane ends with a **lane report** to the lead. It has five parts:
  1. What was built.
  2. **Tested through:** the actual user path exercised and what result would have shown it wrong.
  3. **Not tested:** what remains.
  4. Any contract-change requests.
  5. Any place where the builder rejected or rewrote generated code, and why.
- Builders may spawn their own sub-agents within their lane.

### Phase 2: Integration (the lead)

1. Merge in order: **A → B → C → D**. After each merge, run `npm run typecheck && npm test`, and fix integration breaks on `main` before the next merge.
2. Apply any contract-change requests the lead approved, then rebase the open lanes.
3. Wire the container: the real `LocalStorageRepository` and real services in the app; memory in tests.

### Phase 3: End-to-end and the visual check (the lead, or a spawned E2E builder)

1. Write the Playwright specs in §13.2.
2. Run the app and capture screenshots into `docs/screenshots/` for each of these:
   - documents list as Dana
   - the editor with Auto-prep suggestions showing
   - the editor after accept-all
   - the Send bar with blocking reasons
   - the recipient signing view
   - the signature modal (both tabs)
   - the completed document with the Activity panel
   - the same completed document at 800 px width
3. The lead **opens and looks at every screenshot**. A test passing is not proof that boxes sit in the right cells.

### Phase 4: Independent review

1. Spawn a **reviewer** agent with no prior context. Give it only `PRD.md` and the repo.
2. Task: try to break §5, §6 and §7 through the UI **and** by calling services directly; check §13; and score the app against the rubric table in §1, with specific file and line evidence.
3. The lead fixes every confirmed finding, then re-runs `npm run verify`.
4. Repeat the review once more if the first review found correctness bugs.

### Phase 5: Write-up and final report

1. Write `WRITEUP.md` (§14) and copy it to the repo root.
2. Produce the verification report (§13.3).

---

## 13. Definition of Done (the `/goal` condition)

### 13.1 Automated checks (all must pass from a clean `npm ci`)

- `npm run typecheck`: 0 errors. `npm run lint`: 0 errors. `npm run build`: succeeds.
- `npm test` passes, and includes at least:
  - The state machine allows only `draft→sent` by the sender and `sent→completed` by the recipient. Every other pair, actor and backward move is rejected with a reason.
  - Send is blocked when: there is no recipient; the recipient is the sender; there are no recipient fields; a required sender field is empty; a sender email or phone value is invalid; a sender signature is missing.
  - Finish is blocked when a required recipient field is missing or invalid. An optional fax that is non-empty and invalid also blocks.
  - **Locking is enforced at the service level:**
    - After send, `addField`, `updateField`, `removeField` and `setValue` on a sender field all throw.
    - During send, the recipient's `setValue` on a sender field throws.
    - After completion, every mutation throws for both users.
    - In draft, a recipient write throws.
  - **Visibility:**
    - `listDocumentsFor(u_maria)` excludes Bob's documents.
    - `getDocumentFor` throws for a non-party.
    - The recipient cannot see a draft.
  - Auto-fill: on Send, the sender's `signerName` equals `Dana Reyes` and the sender's auto date equals today. On Finish, the same holds for the recipient. Both are written atomically with the status change.
  - Validation tables for email, phone and date: at least 6 valid and 6 invalid cases each.
  - Geometry: round-trip between points and normalized space; the clamp keeps the rect inside the page; a pointer-to-normalized conversion at two different container widths gives the same normalized point.
  - Audit chain:
    - Every command appends exactly one event with the correct `seq`.
    - `verify` passes on an untouched log.
    - Editing any stored event's `data`, or deleting an event, makes `verify` report the right `brokenAtSeq`.
  - Auto-prep:
    - The sample gives exactly the 17 suggestions in §10.3, matching type, assignee, required and auto-date, with rect IoU ≥ 0.5 and nothing in the body text.
    - The synthetic PDF gives its expected suggestions.
    - The page-swap test passes.
  - The repository contract tests run against **both** `memoryRepository` and `LocalStorageRepository` (jsdom), using the same test suite.
- `npm run test:e2e` passes (see §13.2).

### 13.2 End-to-end specs (Playwright, Chromium, real UI, real localStorage)

1. **Golden path, manual layout.**
   - As Dana: create a document from the sample.
   - Place all 17 target fields by hand, through the palette and drag, with the right types and assignees.
   - Confirm that Send is disabled with listed reasons. Fill Title, then sign by **typing**. Choose Bob and Send.
   - Confirm that Dana's view is read-only and the status is `sent`.
   - Switch to Bob. The document appears with "Needs your action".
   - Open it. Sender values are visible and not editable. Try invalid values (email `bob@nowhere`, phone `12`), and confirm that Finish lists them.
   - Fix them and sign by **drawing** on the canvas. Finish.
   - The status is `completed`, the Print Name and Date fields are auto-filled, and everything is read-only.
   - Switch to Maria. Neither document is listed.
2. **Golden path, Auto-prep.**
   - As Dana: new document, then Auto-prep. 17 suggestions appear. Reject the Fax suggestion, then accept all the rest.
   - Change one suggestion's label before accepting it.
   - Send and finish as above. Check the field count (16) and origins.
3. **Resize.**
   - Take a completed document at a 1280 px viewport, and record each field's on-screen rect relative to its page element.
   - Resize to 800 px and re-measure. Every field's position, divided by the page element's size, must be equal at both widths within 0.5%.
   - The center of every Auto-prep field must lie inside its expected cell from §10.3, scaled to the rendered page.
4. **Persistence.** Reload mid-flow, in a sent state. The status, values, current user and lock all survive.
5. **Tamper.** On a completed document, click "Tamper with history (demo)". The integrity badge changes to "altered at event #N".
6. **Upload.** Upload the synthetic PDF, run Auto-prep, and confirm the suggestions appear on the right page.

### 13.3 The verification report (the lead prints it in the session at the end)

For every item in §13.1 and §13.2, print one line with four parts:

- the item
- the command run
- the pass/fail result taken from the actual output (paste the relevant lines)
- **Tested through:** what was actually exercised, and what result would have shown it wrong

Then add:

- A **Not tested:** list.
- The screenshot paths, and one line per screenshot saying what the lead checked in it.
- The reviewer's findings, and how each one was resolved.

Never write "done", "verified" or "passing" without the output pasted beside it. A count of passing tests is not proof of done. Exercising the path the user takes is.

---

## 14. WRITEUP.md (the submission document, written for the reviewer)

The write-up should be plain and specific, and roughly 2–3 pages. Use these headings, in this order:

1. **How to run it.** `npm ci`, `npm run dev`, then open the URL. Include the test commands, and the seeded users and how to switch between them.
2. **Architecture overview.**
   - The data model: the six types, how they relate, and why the source, layout and values are separate.
   - A Mermaid diagram of the layers in §7.
   - Where state lives, and why the repository is the source of truth with the store as a cache.
   - How the folders map to the layers.
3. **Key decisions** (five, each stating what was chosen, the alternative, and the trade-off):
   1. Field positions as page fractions vs PDF points (§4).
   2. `localStorage` behind an async repository vs in-memory or a mock API. The seam is the point: making the methods async means a real API is one new class.
   3. Status rules as pure guard functions run in both the UI and the service, rather than a state-machine library such as XState. It is overkill for two transitions, and keeping it hand-rolled keeps the rule set readable.
   4. Zustand as a thin cache plus UI state, vs React Context or prop drilling.
   5. An append-only hash-chained audit log as the core record of every command.
4. **My feature: Auto-prep.**
   - What it does, and why it was picked: placing fields is the slowest step, and it is the step most prone to errors.
   - How it plugs in: the detector interface, the pure core, suggestions kept as UI state until accepted, and acceptance going through the same `addField` path as manual placement, so every lock and audit rule still applies.
   - Its limits: it needs a real text layer, so scanned PDFs need text recognition first, and that would be another detector. The keyword tables are English-only.
   - How it would grow: an OCR or model detector behind the same interface, and per-organization keyword tables.
5. **How I used AI.**
   - The tools: Claude Code, with a lead agent coordinating parallel builder agents, each in its own git worktree, and an independent reviewer agent.
   - At least one real instance where generated output was rejected or changed, and why.
   - **The lead fills this only from `docs/ai-usage-log.md` entries that actually happened.** Do not invent examples. Leave a clearly marked placeholder, `<!-- Evan: add your own example here -->`, for Evan to add one in his own words.
6. **What's unfinished.** An honest list: the items from §11, plus anything the reviewer flagged that was deferred, plus any known bugs.

**`docs/ai-usage-log.md`:** throughout the build, the lead appends an entry each time it, or the reviewer, rejects or materially rewrites a builder's output. Each entry gives what was proposed, what was done instead, and why. Builders report theirs in their lane reports, and the lead copies them in.

---

## 15. Libraries (and the one-line reason each, for the write-up)

| Library | Why |
|---|---|
| `react`, `react-dom`, `vite`, `typescript` | The standard setup; strict types make the data model explicit |
| `react-pdf` (pdf.js) | Renders the real PDF, and its text layer feeds Auto-prep; no page-image conversion step |
| `zustand` | A small store that components read with selectors; removes prop drilling without Context boilerplate |
| `react-router-dom` | Each document gets a URL, so a refresh keeps you on it |
| `react-signature-canvas` | A drawn signature without hand-building canvas stroke handling |
| `@fontsource/dancing-script` (or a similar script font) | The typed-signature font is bundled locally, with no network call |
| `@fontsource-variable/schibsted-grotesk` | The interface typeface, bundled locally, so the app makes no font network call |
| Dev: `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`, `pdf-lib`, `eslint`, `prettier` | Tests, the synthetic fixture PDF, and code quality |

Do not add a drag-and-drop library. Pointer events plus `geometry.ts` are under 100 lines, and this keeps coordinate logic in one place. Do not add a form library, XState or a UI kit. Any extra library the lead adds needs a one-line reason in this table and in the write-up.

---

## 16. UI behavior reference

- **Header:** the app name, "Acting as" with a user dropdown, and a menu with "Reset demo data".
- **Documents list:** shows the title, the other party, my role (Sender or Recipient), a status badge, "Needs your action" (bold) when it is my move, and the last updated time. There is a "New document" button.
- **Document screen (draft, sender):** two mode tabs.
  - **Layout:** the palette of 6 types. Click a type, then click the page to drop a default-sized box. Drag the box body to move it, drag the corner handle to resize, and click to select it into the Inspector. The Auto-prep button lives here, along with the suggestion layer.
  - **Fill:** the sender's fields become inputs, and recipient fields show as labeled placeholders.
  - Below the tabs: the RecipientPicker (pick a user, or type an email), and the SendBar with blocking reasons.
- **Document screen (sent, recipient):** all fields are in place. Sender values show read-only, and recipient fields are inputs. Signature fields open the modal. The FinishBar shows its blocking reasons. Opening the document appends a `document.viewed` event once.
- **Document screen (sent, sender, or completed, anyone):** fully read-only, with the status banner and the Activity panel.
- **Field colors by assignee:** for example, sender in blue and recipient in amber. Required fields are marked with a `*` on the box's label tab.
- **Accessibility:**
  - Every input is labeled with its field label.
  - The Send and Finish error summary is a list of buttons that focus the matching field.
  - Keyboard: Delete removes the selected field in Layout mode, and arrow keys nudge it by 0.5%.

---

## Appendix A: Glossary (planning terms → code terms)

| Said in planning | In code |
|---|---|
| Template (the blank PDF) | `SourceDocument` |
| Document / doc ID | `Document` / `documentId` (an envelope: one copy sent to one recipient) |
| Box | `Field` |
| Owner (sender/recipient) | `Field.assignee` |
| What was typed in | `FieldValue` |
| The bouncer | `DocumentService` + the domain guards (`stateMachine.ts`, `permissions.ts`) |
| Noticeboard | the Zustand store |
| Fingerprint chain | the `AuditEvent.hash` / `prevHash` chain |
| Auto-prep | `AutoPrepService` + `FieldDetector`s |
