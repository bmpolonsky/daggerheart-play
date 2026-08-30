/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
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
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuFocusedRef = useRef(false);
  const menuId = `action-menu-${useId()}`;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const root = rootRef.current;
      const menu = menuRef.current;
      if (!root || !menu) return;
      const triggerRect = root.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 8;
      const gap = 8;
      const spaceAbove = triggerRect.top - gap - margin;
      const spaceBelow = window.innerHeight - triggerRect.bottom - gap - margin;
      const preferAbove = placement === 'top-end';
      const openAbove = preferAbove
        ? !(menuRect.height > spaceAbove && spaceBelow > spaceAbove)
        : menuRect.height > spaceBelow && spaceAbove > spaceBelow;
      setMenuPosition({
        left: Math.max(margin, Math.min(window.innerWidth - menuRect.width - margin, triggerRect.right - menuRect.width)),
        top: Math.max(margin, Math.min(
          window.innerHeight - menuRect.height - margin,
          openAbove ? triggerRect.top - menuRect.height - gap : triggerRect.bottom + gap
        ))
      });
    };
    const closeWhenOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', closeWhenOutside);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', closeWhenOutside);
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open || !menuPosition || menuFocusedRef.current) return;
    menuFocusedRef.current = true;
    menuItems().find((item) => !item.disabled)?.focus();
  }, [menuPosition, open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
  };
  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      menuFocusedRef.current = false;
      setMenuPosition(null);
      return next;
    });
  };

  const menu = open ? (
    <div
      ref={menuRef}
      aria-label={ariaLabel}
      className={`dh-portal-scope ${styles.menu}`}
      id={menuId}
      role="menu"
      style={{
        left: `${menuPosition?.left ?? 0}px`,
        top: `${menuPosition?.top ?? 0}px`,
        visibility: menuPosition ? 'visible' : 'hidden'
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
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
            rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
            item.onSelect();
          }}
        >
          {item.icon && <span className={styles.icon} aria-hidden="true">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <div className={`${styles.root} ${className}`.trim()} ref={rootRef}>
        {renderTrigger({
          'aria-controls': menuId,
          'aria-expanded': open,
          'aria-haspopup': 'menu',
          onClick: toggle
        })}
      </div>
      {typeof document === 'undefined' ? menu : createPortal(menu, document.body)}
    </>
  );
}
