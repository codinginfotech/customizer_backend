/**
 * Per-shop critical sections for token work. Shopify retires every other
 * token for an app+store the moment it issues a new one, so two concurrent
 * token exchanges (e.g. the admin's parallel page-load requests) leave one
 * request holding a dead token. Serialising per shop makes the first request
 * do the exchange and the rest reuse its result.
 *
 * In-process only: this API runs as one instance. With several replicas the
 * DB re-check inside each critical section still keeps the window tiny.
 */
const chains = new Map<string, Promise<unknown>>();

export function withShopLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Keep the chain alive but never let one failure poison the next caller.
  const settled = run.catch(() => undefined);
  chains.set(key, settled);
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
