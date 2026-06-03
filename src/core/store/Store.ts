import { Stream } from './Stream';

export type StoreListener<T> = (state: T) => void;
export type StoreUpdater<T> = T | ((current: T) => T);

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
    for (const listener of [...this.listeners]) {
      listener(this.value);
    }
  }
}
