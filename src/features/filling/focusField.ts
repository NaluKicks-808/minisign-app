/** Scrolls to a field's input and focuses it, waiting for Fill mode's pages to render if needed. */
const WAIT_MS = 4000;

export function focusField(fieldId: string): void {
  const selector = `[data-field-id="${CSS.escape(fieldId)}"] [data-testid="field-input"]`;
  const deadline = performance.now() + WAIT_MS;
  const attempt = () => {
    const input = document.querySelector<HTMLElement>(selector);
    if (input) {
      input.scrollIntoView({ block: 'center' });
      input.focus({ preventScroll: true });
    } else if (performance.now() < deadline) {
      requestAnimationFrame(attempt);
    }
  };
  attempt();
}
