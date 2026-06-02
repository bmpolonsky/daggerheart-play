import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ReadableStore } from '../store/Store';

type StoreField = string | symbol;

interface TrackedSnapshot<T extends object> {
  proxy: T;
  source: T;
  trackedFields: Set<StoreField>;
}

export function useStore<T>(store: ReadableStore<T>): T {
  const trackedSnapshotRef = useRef<TrackedSnapshot<Extract<T, object>> | null>(null);
  const getSnapshot = useCallback(() => {
    const next = store.getSnapshot();
    if (!isTrackableSnapshot(next)) {
      return next;
    }
    const current = trackedSnapshotRef.current;
    if (!current) {
      const tracked = createTrackedSnapshot(next);
      trackedSnapshotRef.current = tracked;
      return tracked.proxy as T;
    }
    if (current.source === next) {
      return current.proxy as T;
    }
    if (current.trackedFields.size > 0 && trackedFieldsEqual(current.source, next, current.trackedFields)) {
      current.source = next;
      return current.proxy as T;
    }
    const tracked = createTrackedSnapshot(next, current.trackedFields);
    trackedSnapshotRef.current = tracked;
    return tracked.proxy as T;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function isTrackableSnapshot<T>(snapshot: T): snapshot is Extract<T, object> {
  return (typeof snapshot === 'object' || typeof snapshot === 'function') && snapshot !== null;
}

function createTrackedSnapshot<T extends object>(source: T, trackedFields = new Set<StoreField>()): TrackedSnapshot<T> {
  const tracked: TrackedSnapshot<T> = {
    proxy: {} as T,
    source,
    trackedFields: new Set(trackedFields)
  };
  tracked.proxy = new Proxy({}, {
    get(_target, field) {
      tracked.trackedFields.add(field);
      return Reflect.get(tracked.source, field, tracked.source);
    },
    getOwnPropertyDescriptor(_target, field) {
      tracked.trackedFields.add(field);
      const descriptor = Reflect.getOwnPropertyDescriptor(tracked.source, field);
      if (!descriptor) return undefined;
      return {
        ...descriptor,
        configurable: true
      };
    },
    has(_target, field) {
      tracked.trackedFields.add(field);
      return Reflect.has(tracked.source, field);
    },
    ownKeys() {
      const keys = Reflect.ownKeys(tracked.source);
      for (const key of keys) {
        tracked.trackedFields.add(key);
      }
      return keys;
    }
  }) as T;
  return tracked;
}

function trackedFieldsEqual<T extends object>(previous: T, next: T, fields: Set<StoreField>): boolean {
  for (const field of fields) {
    if (!Object.is(Reflect.get(previous, field, previous), Reflect.get(next, field, next))) {
      return false;
    }
  }
  return true;
}
