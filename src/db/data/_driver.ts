/**
 * Internal driver module — holds the db instance and async wrappers.
 * Only data layer modules should import from here; never re-export from barrel.
 *
 * All public data-layer functions return Promise<T>. SQLite is synchronous,
 * so we wrap with Promise.resolve(). When PostgreSQL lands, Drizzle calls
 * become natively async and these wrappers are removed — no consumer changes.
 */

import { db } from "..";

export { db };

export function asAsync<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export function runAsync(fn: () => void): Promise<void> {
  fn();
  return Promise.resolve();
}
