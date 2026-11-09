import { useState, type FormEvent } from 'react';
import { isValidEmail } from '../../domain/validation';
import { useAppStore } from '../../store/useAppStore';
import { useOptimisticValue } from './useOptimisticValue';
import styles from './RecipientPicker.module.css';

/** Pick another user, or send to an email address. */
export function RecipientPicker() {
  const users = useAppStore((s) => s.users);
  const senderId = useAppStore((s) => s.activeBundle?.document.senderId);
  const recipientId = useAppStore((s) => s.activeBundle?.document.recipientId);
  const setRecipient = useAppStore((s) => s.setRecipient);
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);

  const others = users.filter((user) => user.id !== senderId);
  const [selected, select] = useOptimisticValue(
    others.some((user) => user.id === recipientId) ? (recipientId ?? '') : '',
    (userId: string) => setRecipient({ userId }),
  );

  if (!senderId) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!isValidEmail(address)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEmail('');
    void setRecipient({ email: address });
  };

  return (
    <div className={styles.picker}>
      <span className={styles.caption}>Send to</span>
      <select
        aria-label="Recipient"
        className="select"
        value={selected}
        onChange={(event) => select(event.target.value)}
      >
        <option value="" disabled>
          Choose a person
        </option>
        {others.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.email})
          </option>
        ))}
      </select>
      <span className={styles.caption}>or</span>
      <form className={styles.email} onSubmit={onSubmit} noValidate>
        <input
          aria-label="Recipient email"
          aria-invalid={invalid}
          className="input"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setInvalid(false);
          }}
        />
        <button type="submit" className="btn" disabled={!email.trim()}>
          Use email
        </button>
      </form>
      {invalid && (
        <p className={`error-text ${styles.error}`} role="alert">
          Enter a valid email address.
        </p>
      )}
    </div>
  );
}
