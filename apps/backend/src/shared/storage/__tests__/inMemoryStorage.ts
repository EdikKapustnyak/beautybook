import type { StoragePort } from '../storagePort.js';

export interface InMemoryStorage extends StoragePort {
  /** Test-only inspection helpers, not part of StoragePort. */
  has(key: string): boolean;
  size(): number;
}

export function createInMemoryStorage(): InMemoryStorage {
  const objects = new Map<string, Buffer>();

  return {
    async putObject(key, body) {
      objects.set(key, body);
    },
    async getObject(key) {
      const object = objects.get(key);
      if (!object) {
        throw new Error(`Object not found: ${key}`);
      }
      return object;
    },
    async deleteObject(key) {
      objects.delete(key);
    },
    getPublicUrl(key) {
      return `https://fake-storage.test/${key}`;
    },
    has(key) {
      return objects.has(key);
    },
    size() {
      return objects.size;
    },
  };
}
