export class RelayTransportError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = 'RelayTransportError';
  }
}
