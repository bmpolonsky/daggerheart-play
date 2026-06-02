export type StoreListener<T> = (state: T) => void;
export type StoreUpdater<T> = T | ((current: T) => T);

export interface ReadableStore<T> {
  getSnapshot(): T;
  subscribe(listener: StoreListener<T>): () => void;
}

export interface WritableStore<T> extends ReadableStore<T> {
  getState(): T;
  set(next: T): void;
  update(updater: StoreUpdater<T>): void;
  reset(next: T): void;
}

export class Store<T> implements WritableStore<T> {
  private value: T;
  private readonly listeners = new Set<StoreListener<T>>();

  constructor(initialValue: T) {
    this.value = initialValue;
  }

  getSnapshot = (): T => this.value;

  getState = (): T => this.value;

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
    for (const listener of [...this.listeners]) {
      listener(this.value);
    }
  }
}
