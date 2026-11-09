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
