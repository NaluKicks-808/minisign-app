# AI usage log

One entry each time the lead or the reviewer rejected or materially rewrote generated output: what was proposed, what was done instead, and why.

## Lead's changes to builder output

- **Field flags.** Proposed: every field carries a full label flag above its box at all times. Seen on real screenshots: on the sample's dense table the flags covered the printed captions and the filled-in values above them. Done instead: a small tab on the box's edge (starred when required), and the full flag only on hover, focus or selection. Why: a label that hides the document is worse than no label.
- **Duplicate field wrapper.** Proposed: the filling lane's `FieldInput` stamped its own `field-box` hooks and its own hover flag inside the viewer lane's `FieldLayer`, which already renders those. Done instead: removed them from `FieldInput`. Why: two elements answered as one field, so every lookup by label was ambiguous, and each box would have had two flags.
- **Suggestion boxes.** Proposed: fixed-size type and label text in each dashed box, overflowing the sample's 11 pt cells. Done instead: text sized from the box height; the review form moved above the palette so it is visible without scrolling.

## Builder lane reports (rewrites of generated code)

- **Viewer.** Proposed: `60cqh` on the same element that declared `container-type`; it resolved against the viewport (540 px text). Done: moved the container to the parent. The check that had passed was also rewritten to compare against field height.
- **Inspector.** Proposed: directly controlled checkboxes; they snapped back during the async save. Done: a small optimistic-value hook.
- **Signature.** Proposed: the library's `getTrimmedCanvas`; it threw under Vite. Done: a local `trimSignature.ts`.
- **Auto-prep classification.** Proposed: signature keywords checked first; "Date signed" came out as a signature. Done: date checked first.
- **Auto-prep underline search.** Proposed: stop at the text margin; it missed the right-column rule. Done: search to the page edge.

## Reviewer

- **Write-up.** Proposed by the lead: "All coordinate arithmetic lives in that module." The reviewer found the Auto-prep adapter divides by page size itself. Done: the sentence was corrected to say so.
- **Recipient name.** Generated: a recipient added by email took the part before the @ as their name, and the signer-name field then stamped that string. Done: the picker asks for the recipient's full name.
- **Audit chain.** Generated: a bare hash chain, described as tamper-evident. A probe showed deleting the newest event went unnoticed. Done: each document stores its head sequence and hash, and verification compares them.
- **Blank drawn signature.** Generated: switching to Type and back cleared the ink but left Apply enabled. Done: the ink state resets with the tab.

## Walkthrough

- **Keyboard placement.** Generated: palette buttons armed a mode that only a mouse click on the page could finish. Done: a page picker and "Place on this page" button; arrow keys then move the field.
- **Reset demo data.** Generated: one click erased everything. Done: the menu asks first and offers to keep the documents.

## Changes the tests overturned

- **Skipping unchanged saves.** Proposed by the lead: no `value.set` event when the value did not change. The seeded sequence test failed, because the PRD says each command appends exactly one event. Done: the change was dropped and the behaviour is listed as a gap.
