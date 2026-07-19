/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import styles from './ActionMenu.module.css';

type UiNode = any;

export type ActionMenuItem = {
  id: string;
  label: string;
  icon?: ComponentChildren;
  disabled?: boolean;
  onSelect: () => void;
};

export type ActionMenuTriggerProps = {
  'aria-controls': string;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu';
  onClick: () => void;
};

export interface ActionMenuProps {
  ariaLabel: string;
  items: readonly ActionMenuItem[];
  renderTrigger: (props: ActionMenuTriggerProps) => UiNode;
  className?: string;
  placement?: 'bottom-end' | 'top-end';
}

export function ActionMenu({ ariaLabel, className = '', items, placement = 'bottom-end', renderTrigger }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    return () => document.removeEventListener('pointerdown', closeWhenOutside);
  }, [open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
  };
  const menuItems = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (next) window.setTimeout(() => menuItems().find((item) => !item.disabled)?.focus(), 0);
      return next;
    });
  };

  return (
    <div className={`${styles.root} ${placement === 'top-end' ? styles.topEnd : ''} ${className}`.trim()} ref={rootRef}>
      {renderTrigger({
        'aria-controls': menuId,
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        onClick: toggle
      })}
      {open && (
        <div
          aria-label={ariaLabel}
          className={styles.menu}
          id={menuId}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeAndRestoreFocus();
              return;
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const enabledItems = menuItems().filter((item) => !item.disabled);
            const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            enabledItems[(currentIndex + direction + enabledItems.length) % enabledItems.length]?.focus();
          }}
        >
          {items.map((item) => (
            <button
              className={styles.item}
              disabled={item.disabled}
              key={item.id}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <span className={styles.icon} aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
