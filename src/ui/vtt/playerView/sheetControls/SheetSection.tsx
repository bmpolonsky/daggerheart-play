/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';

export function SheetSection({ id, title, emptyLabel, children }: { id?: string; title: ComponentChildren; emptyLabel?: string; children?: ComponentChildren }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;
  return (
    <section className="player-sheet-section" id={id}>
      <h3>{title}</h3>
      {isEmpty ? <p>{emptyLabel ?? 'Пока пусто.'}</p> : items}
    </section>
  );
}
