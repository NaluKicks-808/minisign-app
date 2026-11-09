import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { UserSwitcher } from './UserSwitcher';
import styles from './Header.module.css';

function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const resetDemo = useAppStore((s) => s.resetDemo);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function onReset() {
    setOpen(false);
    navigate('/');
    void resetDemo();
  }

  return (
    <div className={styles.menu} ref={root}>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        Menu
      </button>
      <div id={menuId} className={styles.menuPanel} hidden={!open}>
        <button type="button" className={styles.menuItem} onClick={onReset}>
          Reset demo data
        </button>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        MiniSign
      </Link>
      <div className={styles.tools}>
        <UserSwitcher />
        <HeaderMenu />
      </div>
    </header>
  );
}
