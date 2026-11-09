# Lanes

Each builder edits only what its lane owns. A contract change is a request to the lead, never an edit. Dependencies are already installed; do not add any. Styling: plain CSS Modules (`*.module.css`) next to the component, built from `src/styles/tokens.css` and the classes in `src/styles/base.css`.

| Lane | Owns | Delivers |
|---|---|---|
| A: Domain & services | `src/domain/{validation,stateMachine,permissions,autofill,canonicalJson,hashChain}.ts`, `src/data/localStorageRepository.ts`, `src/data/seed.ts`, `src/services/{auditLog,documentService}.ts`, `tests/unit/domain/**`, `tests/unit/services/**`, `tests/unit/data/**` | Every guard, the LocalStorageRepository, DocumentService, AuditLog, §13.1 tests for them |
| B: Viewer & layout editor | `src/features/viewer/**`, `src/features/layout-editor/**`, `src/domain/geometry.ts`, `tests/unit/geometry/**` | PDF rendering, FieldLayer, click-to-place, drag, resize, inspector, Delete and arrow keys, RecipientPicker, geometry tests |
| C: Filling, signing, shell | `src/features/filling/**`, `src/features/documents/**` (not `UploadSource.tsx`), `src/features/session/**`, `src/features/activity/**`, `src/store/**`, `src/App.tsx` | FieldInput, SignatureModal, ValidationSummary, SendBar, FinishBar, read-only render, DocumentScreen, DocumentsList, NewDocument, UserSwitcher, Header, ActivityPanel, tamper button, store |
| D: Auto-prep | `src/features/autoprep/**`, `src/features/documents/UploadSource.tsx`, `src/services/autoPrepService.ts`, `tests/fixtures/**`, `tests/unit/autoprep/**` | Extraction adapter, detectors, classifiers, synthetic PDF, §10.3 fixture, SuggestionLayer, AutoPrepButton, upload, §10.3–10.4 tests |

## How the screens compose

`/documents/:id` is `DocumentScreen` (lane C). For a draft owned by the sender it shows the Layout and Fill tabs. Layout mode renders `<LayoutEditor />` (lane B), which renders `<PdfDocumentView renderOverlay={page => <><FieldLayer page={page} renderField={...FieldBox} /><SuggestionLayer page={page} /></>} />`, plus `<AutoPrepButton />` and, when a suggestion is selected, `<SuggestionInspector />` (lane D). Fill, signing and read-only render `<PdfDocumentView renderOverlay={page => <FieldLayer page={page} renderField={...FieldInput} />} />` (lane C).

## Test hooks (e2e depends on these exact names)

| Thing | Hook |
|---|---|
| Page container | `data-testid="page-surface-<n>"` |
| Any placed field box, in every mode | `data-testid="field-box"`, `data-field-id`, `data-field-label`, `data-field-type`, `data-assignee`, `data-origin` |
| Palette | `data-testid="palette-<type>"` |
| Inspector inputs | labels "Label", "Type", "Required", "Assignee", "Fill in the signing date" ; button "Delete field" |
| Recipient picker | `<select aria-label="Recipient">`; email `<input aria-label="Recipient email">` with button "Use email" |
| Layout / Fill tabs | `role="tab"` named "Layout" and "Fill" |
| Field input | `data-testid="field-input"` inside its field box, `aria-label` = field label |
| Signature field | a button inside the field box, `data-testid="field-input"`, name = field label |
| Signature modal | `data-testid="signature-modal"`, `role="tab"` "Type" and "Draw", input labelled "Type your name", `data-testid="signature-canvas"` (the canvas), buttons "Clear" and "Apply" |
| Send / Finish | `data-testid="send-button"`, `data-testid="finish-button"` |
| Blocking reasons | `data-testid="blocking-reasons"`, each reason a `<button>` for field issues |
| Status | `data-testid="status-badge"`, text is the status word |
| List row | `data-testid="document-row"`, `data-document-id`; text "Needs your action" when it is my move |
| New document | link or button "New document"; source choice button named "Use this document"; upload `<input type="file" aria-label="Upload a PDF">` |
| User switcher | `<select aria-label="Acting as">` |
| Reset | button "Reset demo data" |
| Auto-prep | `data-testid="autoprep-button"`, `data-testid="suggestion-box"` with `data-label`, `data-field-type`, `data-assignee`, `data-page`; buttons "Accept", "Reject" (for the selected suggestion), "Accept all", "Reject all"; suggestion form labels "Label", "Type", "Assignee", "Required" |
| Activity | `data-testid="activity-panel"`, `data-testid="integrity-badge"`, `data-testid="tamper-button"` |
