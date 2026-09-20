/**
 * Native session storage for the Supabase auth client.
 *
 * Android's SecureStore rejects values larger than 2048 bytes, and a Supabase
 * session carrying a refresh token plus user metadata routinely exceeds that.
 * Values are therefore split across numbered chunks with a small manifest under
 * the caller's key, so token growth cannot silently start failing writes.
 *
 * Chunk boundaries never split a surrogate pair: a lone surrogate would be
 * replaced on the UTF-8 round trip through the keystore and corrupt the
 * session.
 */

import * as SecureStore from 'expo-secure-store';

import type { SessionStorageAdapter } from '@odin/data';

/** Well under the 2048-byte limit once multi-byte characters are encoded. */
const MAX_CHUNK_CHARS = 512;
const MANIFEST_PREFIX = 'odin.chunks:';

function chunkKey(key: string, index: number): string {
  return `${key}.${String(index)}`;
}

/** Avoids ending a chunk on a high surrogate whose pair would be split. */
function chunkEnd(value: string, start: number): number {
  const end = Math.min(start + MAX_CHUNK_CHARS, value.length);
  if (end >= value.length) return end;
  const code = value.charCodeAt(end - 1);
  const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
  return isHighSurrogate ? end - 1 : end;
}

function splitIntoChunks(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    const end = chunkEnd(value, start);
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

function parseManifest(stored: string | null): number | null {
  if (stored === null || !stored.startsWith(MANIFEST_PREFIX)) return null;
  const count = Number.parseInt(stored.slice(MANIFEST_PREFIX.length), 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

async function clearChunks(key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, index));
  }
}

export function createSecureSessionStorage(): SessionStorageAdapter {
  return {
    async getItem(key: string): Promise<string | null> {
      const head = await SecureStore.getItemAsync(key);
      const count = parseManifest(head);
      if (count === null) return head;

      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, index));
        // A missing chunk means a partially written session; treat the whole
        // value as absent so the user is asked to sign in again.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      const previous = parseManifest(await SecureStore.getItemAsync(key));
      if (previous !== null) await clearChunks(key, previous);

      const chunks = splitIntoChunks(value);
      if (chunks.length <= 1) {
        await SecureStore.setItemAsync(key, value);
        return;
      }

      // Chunks are written before the manifest, so an interrupted write leaves
      // the previous manifest pointing at data that is already gone rather than
      // a manifest pointing at data that was never written.
      for (const [index, chunk] of chunks.entries()) {
        await SecureStore.setItemAsync(chunkKey(key, index), chunk);
      }
      await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${String(chunks.length)}`);
    },

    async removeItem(key: string): Promise<void> {
      const count = parseManifest(await SecureStore.getItemAsync(key));
      if (count !== null) await clearChunks(key, count);
      await SecureStore.deleteItemAsync(key);
    },
  };
}
