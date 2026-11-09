import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { UserSwitcher } from './UserSwitcher';
import styles from './Header.module.css';

function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const resetDemo = useAppStore((s) => s.resetDemo);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  function onReset() {
    close();
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
        onClick={() => (open ? close() : setOpen(true))}
      >
        Menu
      </button>
      <div id={menuId} className={styles.menuPanel} hidden={!open}>
        {confirming ? (
          <>
            <p className={styles.menuWarning}>Erase every document and its history?</p>
            <button type="button" className={styles.menuItem} autoFocus onClick={close}>
              Keep my documents
            </button>
            <button type="button" className={styles.menuItem} onClick={onReset}>
              Erase and start over
            </button>
          </>
        ) : (
          <button type="button" className={styles.menuItem} onClick={() => setConfirming(true)}>
            Reset demo data
          </button>
        )}
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
