import { useNavigate } from 'react-router-dom';
import { selectCurrentUserId } from '../../store/selectors';
import { useAppStore } from '../../store/useAppStore';
import styles from './Header.module.css';

export function UserSwitcher() {
  const users = useAppStore((s) => s.users);
  const currentUserId = useAppStore(selectCurrentUserId);
  const switchUser = useAppStore((s) => s.switchUser);
  const navigate = useNavigate();

  function onChange(id: string) {
    navigate('/');
    void switchUser(id);
  }

  return (
    <div className={styles.switcher}>
      <span className={styles.actingAs}>Acting as</span>
      <select
        aria-label="Acting as"
        className={styles.userSelect}
        value={currentUserId}
        onChange={(e) => onChange(e.target.value)}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
