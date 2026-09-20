import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest APIs are imported explicitly rather than injected as globals, so
// Testing Library's automatic cleanup never registers itself. Without this,
// each render leaks into the next test's document.
afterEach(() => {
  cleanup();
});
