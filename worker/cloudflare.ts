export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface R2Object {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpMetadata?: {
    contentType?: string;
  };
}

export interface R2Objects {
  objects: Array<{ key: string }>;
  truncated: boolean;
  cursor?: string;
}

export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string } }): Promise<{ size?: number } | void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<R2Objects>;
  delete(keys: string | string[]): Promise<void>;
}

export interface WorkerEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
