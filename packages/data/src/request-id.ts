/** Native bootstrap injects its cryptographic UUID source once before rendering. */
let generate = (): string => globalThis.crypto.randomUUID();

export function configureRequestIdGenerator(generator: () => string): void {
  generate = generator;
}

export function newRequestId(): string {
  return generate();
}
