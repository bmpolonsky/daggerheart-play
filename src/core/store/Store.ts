import { Stream } from './Stream';

export type StoreListener<T> = (state: T) => void;
export type StoreUpdater<T> = T | ((current: T) => T);

let batchDepth = 0;
const pendingNotifications = new Set<() => void>();

/** Publish related synchronous values together, before notifying any observer. */
export function batchStoreUpdates<T>(update: () => T): T {
  batchDepth++;
  try { return update(); }
  finally {
    batchDepth--;
    if (batchDepth === 0) {
      const notifications = [...pendingNotifications];
      pendingNotifications.clear();
      for (const notify of notifications) notify();
    }
  }
}

export class Store<T> {
  private value: T;
  private listeners = new Set<StoreListener<T>>();
  private stream: Stream<T> | null = null;

  constructor(initialValue: T) {
    this.value = initialValue;
  }

  get = (): T => this.value;

  toStream(): Stream<T> {
    this.stream ??= Stream.from(this);
    return this.stream;
  }

  subscribe = (listener: StoreListener<T>): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(next: T): void {
    if (Object.is(this.value, next)) {
      return;
    }
    this.value = next;
    this.emit();
  }

  update(updater: StoreUpdater<T>): void {
    const next = typeof updater === 'function' ? (updater as (current: T) => T)(this.value) : updater;
    this.set(next);
  }

  reset(next: T): void {
    this.value = next;
    this.emit();
  }

  private emit(): void {
    if (batchDepth > 0) { pendingNotifications.add(this.notify); return; }
    this.notify();
  }

  private notify = (): void => {
    for (const listener of [...this.listeners]) {
      listener(this.value);
    }
  };
}
