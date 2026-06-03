export type Unsubscribe = () => void;

export interface StreamLike<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

const STREAM_SYMBOL = Symbol.for('daggerheart-play.stream');

export class Stream<T> implements StreamLike<T> {
  public readonly [STREAM_SYMBOL] = true;

  private constructor(private readonly source: StreamLike<T>) {}

  static from<T>(source: StreamLike<T> | Stream<T>): Stream<T> {
    if (Stream.isStream<T>(source)) {
      return source;
    }
    return new Stream(source);
  }

  static isStream<T = unknown>(value: unknown): value is Stream<T> {
    return Boolean(value && typeof value === 'object' && (value as Stream<unknown>)[STREAM_SYMBOL] === true);
  }

  get = (): T => {
    return this.source.get();
  };

  subscribe = (listener: (value: T) => void): Unsubscribe => {
    return this.source.subscribe(listener);
  };

  map = <U>(project: (value: T) => U): Stream<U> => {
    return Stream.from({
      get: () => project(this.get()),
      subscribe: (listener) => this.subscribe((value) => listener(project(value)))
    });
  };
}
