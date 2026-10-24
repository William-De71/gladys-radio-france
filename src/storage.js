// -----------------------------------------------------------------------------
// Small JSON files in /data, the only writable folder of the container.
//
//   usage.json     the request counter of the day (Paris) and a quota pause
//   settings.json  the follow switch of every station created in Gladys
//
// Never anything of Radio France: the terms of use and the FAQ of the Open
// API forbid storing its data (station list, programs, tracks).
//
// Written to a temporary file then renamed (a crash never leaves half a
// file), readable by the container user only.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @description Create the storage.
 * @param {string} [dir] - Folder (`/data` in the container).
 * @returns {{ read: Function, write: Function }} The storage.
 */
export function createStorage(dir = process.env.RADIO_FRANCE_DATA_DIR || '/data') {
  return {
    /**
     * @param {string} name - File name.
     * @returns {Promise<object|null>} The content, null when missing or unreadable.
     */
    async read(name) {
      try {
        return JSON.parse(await readFile(join(dir, name), 'utf8'));
      } catch {
        return null;
      }
    },

    /**
     * @param {string} name - File name.
     * @param {object|null} value - Content, null to delete the file.
     */
    async write(name, value) {
      const path = join(dir, name);
      if (value === null || value === undefined) {
        await rm(path, { force: true });
        return;
      }
      await mkdir(dir, { recursive: true });
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await rename(temporary, path);
    },
  };
}

/**
 * @description A storage kept in memory (tests).
 * @param {object} [initial] - Initial files.
 * @returns {{ read: Function, write: Function, files: object }} The storage.
 */
export function memoryStorage(initial = {}) {
  const files = { ...initial };
  return {
    files,
    async read(name) {
      return files[name] === undefined ? null : structuredClone(files[name]);
    },
    async write(name, value) {
      if (value === null || value === undefined) {
        delete files[name];
      } else {
        files[name] = structuredClone(value);
      }
    },
  };
}
