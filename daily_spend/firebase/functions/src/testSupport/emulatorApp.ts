import { getApps, initializeApp } from 'firebase-admin/app';

/**
 * Shared by every `*.integration.test.ts` file's `before()` hook.
 *
 * Mocha loads all spec files into one Node process, so each file calling
 * `initializeApp()` directly would throw "the default Firebase app
 * already exists" the second time — the Admin SDK allows only one
 * default app per process. Guarding on `getApps().length` makes this
 * idempotent regardless of how many integration test files there are or
 * what order they run in.
 *
 * "demo-*" project IDs are treated specially by the Firebase Local
 * Emulator Suite: no real GCP project or credentials required.
 */
export function ensureTestAppInitialized(): void {
  if (getApps().length === 0) {
    initializeApp({ projectId: 'demo-daily-spend' });
  }
}
