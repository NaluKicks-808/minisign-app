import { useEffect, useId, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import type { Field, SignatureValue } from '../../domain/types';
import { validateValue } from '../../domain/validation';
import { selectFieldValue } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import { trimmedSignaturePng } from './trimSignature';
import styles from './SignatureModal.module.css';

type Tab = 'type' | 'draw';

// A named object, because a fresh literal may not carry data-* keys.
const CANVAS_PROPS = { 'data-testid': 'signature-canvas', className: styles.canvas };

function SignatureDialog({ field }: { field: Field }) {
  const setValue = useAppStore((s) => s.setValue);
  const closeModal = useAppStore((s) => s.closeModal);
  const stored = useAppStore(selectFieldValue(field.id));
  const existing = typeof stored === 'object' ? stored : undefined;

  const [tab, setTab] = useState<Tab>(existing?.kind === 'drawn' ? 'draw' : 'type');
  const [text, setText] = useState(existing?.kind === 'typed' ? existing.text : '');
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  // The canvas sizes itself on mount, so it must wait until the dialog has layout.
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<SignatureCanvas>(null);
  const titleId = useId();

  useEffect(() => {
    // showModal gives the focus trap, Escape and focus return. Every exit ends in onClose.
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    setDialogOpen(true);
  }, []);

  const typed: SignatureValue = { kind: 'typed', text: text.trim() };
  const typedError = validateValue('signature', typed, true);
  const canApply = !saving && (tab === 'type' ? typedError === null : hasInk);

  function switchTab(next: Tab) {
    // Leaving Draw unmounts the canvas, and its ink goes with it.
    if (next !== tab) setHasInk(false);
    setTab(next);
  }

  function clear() {
    if (tab === 'type') setText('');
    else {
      canvas.current?.clear();
      setHasInk(false);
    }
  }

  async function apply() {
    const value: SignatureValue =
      tab === 'type'
        ? typed
        : { kind: 'drawn', pngDataUrl: trimmedSignaturePng(canvas.current!.getCanvas()) };
    setSaving(true);
    await setValue(field.id, value);
    dialog.current?.close();
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-testid="signature-modal"
      aria-labelledby={titleId}
      onClose={closeModal}
    >
      <h2 id={titleId}>Sign: {field.label}</h2>
      <div role="tablist" aria-label="How to sign" className={styles.tabs}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'type'}
          className={styles.tab}
          onClick={() => switchTab('type')}
        >
          Type
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'draw'}
          className={styles.tab}
          onClick={() => switchTab('draw')}
        >
          Draw
        </button>
      </div>

      {tab === 'type' ? (
        <div className={styles.pane}>
          <label className="field-label" htmlFor={`${titleId}-name`}>
            Type your name
          </label>
          <input
            id={`${titleId}-name`}
            className="input"
            autoFocus
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className={styles.preview}>{text}</div>
          {text.trim() !== '' && typedError && <p className="error-text">{typedError}</p>}
        </div>
      ) : (
        <div className={styles.pane}>
          <p className={styles.hint}>Sign in the box with your mouse or finger.</p>
          {dialogOpen && (
            <SignatureCanvas
              ref={canvas}
              canvasProps={CANVAS_PROPS}
              clearOnResize={false}
              penColor="#16233b"
              onEnd={() => setHasInk(!canvas.current?.isEmpty())}
            />
          )}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className="btn" onClick={clear}>
          Clear
        </button>
        <span className={styles.spacer} />
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canApply}
          onClick={() => void apply()}
        >
          Apply
        </button>
      </div>
    </dialog>
  );
}

export function SignatureModal() {
  const field = useAppStore((s) =>
    s.modal ? s.activeBundle?.fields.find((f) => f.id === s.modal?.fieldId) : undefined,
  );
  if (!field) return null;
  return <SignatureDialog key={field.id} field={field} />;
}
