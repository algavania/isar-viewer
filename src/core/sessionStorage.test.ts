import { describe, it, expect } from 'vitest';
import {
  saveActiveSession,
  restoreActiveSession,
  updateSessionMetadata,
  clearActiveSession,
} from './sessionStorage';

describe('sessionStorage (environment safety test)', () => {
  it('handles environment without indexedDB gracefully without throwing', async () => {
    // In Node.js test environment, indexedDB is undefined
    const session = await restoreActiveSession();
    expect(session).toBeNull();

    await expect(
      saveActiveSession({
        fileName: 'test.isar',
        buffer: new ArrayBuffer(16),
      })
    ).resolves.not.toThrow();

    await expect(
      updateSessionMetadata({
        selectedCollection: 'Test',
        activeView: 'data',
      })
    ).resolves.not.toThrow();

    await expect(clearActiveSession()).resolves.not.toThrow();
  });
});
