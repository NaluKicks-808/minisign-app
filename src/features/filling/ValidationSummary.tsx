import type { FieldIssue, GuardResult } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { focusField } from './focusField';
import styles from './ValidationSummary.module.css';

const issueText = (issue: FieldIssue) =>
  issue.message.includes(issue.label) ? issue.message : `${issue.label}: ${issue.message}`;

/** The guard's reasons repeat the field issues; those show once, as buttons. */
function repeatsAnIssue(reason: string, issues: FieldIssue[]): boolean {
  return issues.some((i) => reason.includes(i.message) || reason.startsWith(i.label));
}

export function ValidationSummary({
  guard,
  issues,
  heading,
}: {
  guard: GuardResult;
  issues: FieldIssue[];
  heading: string;
}) {
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const editorMode = useAppStore((s) => s.editorMode);
  if (guard.ok) return null;

  const otherReasons = guard.reasons.filter((r) => !repeatsAnIssue(r, issues));

  function goTo(fieldId: string) {
    // Only Fill mode has inputs; Layout mode's boxes cannot take a value.
    if (editorMode !== 'fill') setEditorMode('fill');
    focusField(fieldId);
  }

  return (
    <div className={styles.summary} data-testid="blocking-reasons">
      <span className={styles.heading}>{heading}</span>
      <ul className={styles.list}>
        {otherReasons.map((reason) => (
          <li key={reason} className={styles.reason}>
            {reason}
          </li>
        ))}
        {issues.map((issue) => (
          <li key={issue.fieldId}>
            <button type="button" className={styles.issue} onClick={() => goTo(issue.fieldId)}>
              {issueText(issue)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
