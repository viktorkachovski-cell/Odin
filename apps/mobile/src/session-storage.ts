/**
 * Native session storage for the Supabase auth client.
 *
 * SecureStore rejects values over 2048 bytes and a session routinely exceeds
 * that, so values are split into chunks behind a manifest. A chunk never ends
 * on half a surrogate pair, which the keystore's UTF-8 round trip would corrupt.
 *
 * The auth client reads the session before every request, so values are kept
 * in memory after the first read; this process is the only writer. Memory
 * follows the latest write even if the keystore write fails, so a sign-out is
 * never undone by reading back the session it failed to delete.
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

async function readItem(key: string): Promise<string | null> {
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
}

async function writeItem(key: string, value: string): Promise<void> {
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
}

async function deleteItem(key: string): Promise<void> {
  const count = parseManifest(await SecureStore.getItemAsync(key));
  if (count !== null) await clearChunks(key, count);
  await SecureStore.deleteItemAsync(key);
}

export function createSecureSessionStorage(): SessionStorageAdapter {
  const memory = new Map<string, string | null>();

  return {
    async getItem(key: string): Promise<string | null> {
      if (memory.has(key)) return memory.get(key) ?? null;
      const value = await readItem(key);
      // A write that landed while the keystore was being read is newer.
      if (!memory.has(key)) memory.set(key, value);
      return memory.get(key) ?? null;
    },

    async setItem(key: string, value: string): Promise<void> {
      memory.set(key, value);
      await writeItem(key, value);
    },

    async removeItem(key: string): Promise<void> {
      memory.set(key, null);
      await deleteItem(key);
    },
  };
}
