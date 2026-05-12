import { useEffect, useState } from "preact/hooks";

type Listener<T> = (state: T) => void;
type Updater<T> = (state: T) => T;

export class Store<T> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState() {
    return this.state;
  }

  subscribe(listener: Listener<T>) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(updater: Updater<T>) {
    const nextState = updater(this.state);
    if (Object.is(nextState, this.state)) {
      return;
    }

    this.state = nextState;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export function useStore<T>(store: Store<T>) {
  const [state, setState] = useState(store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe(setState);
    // Catch updates that happened between render and effect subscription.
    setState(store.getState());
    return unsubscribe;
  }, [store]);

  return state;
}
