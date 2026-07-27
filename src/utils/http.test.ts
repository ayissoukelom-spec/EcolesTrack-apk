import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveApiBaseUrl } from './http.ts';

test('resolveApiBaseUrl uses a query override when provided', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        search: '?apiBaseUrl=http://example.test:4000',
        hash: '',
      },
    },
    configurable: true,
  });

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => null,
    },
    configurable: true,
  });

  try {
    assert.equal(resolveApiBaseUrl(), 'http://example.test:4000');
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
      });
    }

    if (originalLocalStorage === undefined) {
      delete (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      });
    }
  }
});
