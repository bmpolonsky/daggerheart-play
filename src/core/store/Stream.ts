export type Unsubscribe = () => void;

export interface StreamLike<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

type StreamSources = Record<string, StreamLike<any>>;
type StreamValues<TSources extends StreamSources> = {
  [Key in keyof TSources]: TSources[Key] extends StreamLike<infer Value> ? Value : never;
};

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

  static combine<TSources extends StreamSources>(sources: TSources): Stream<StreamValues<TSources>> {
    const readValues = (): StreamValues<TSources> => {
      const values = {} as StreamValues<TSources>;
      for (const key of Object.keys(sources) as Array<keyof TSources>) {
        values[key] = sources[key].get() as StreamValues<TSources>[typeof key];
      }
      return values;
    };

    return Stream.from({
      get: readValues,
      subscribe: (listener) => {
        const notify = () => listener(readValues());
        const unsubscribes = Object.values(sources).map((source) => source.subscribe(notify));
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
      }
    });
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
