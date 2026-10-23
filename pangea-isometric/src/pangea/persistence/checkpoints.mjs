import { openDB } from './vendor/idb.mjs';
import { Simulation, validateSave } from '../simulation/sim.mjs';

const LEGACY_KEY = 'pangea-isometric-world-v1';
export class CheckpointError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name = 'CheckpointError'; this.code = code; }
}
const storageError = error => error instanceof CheckpointError ? error : new CheckpointError(
  error?.name === 'QuotaExceededError' ? 'quota' : 'unavailable',
  error?.name === 'QuotaExceededError' ? 'Browser storage is full. Export this world to keep it.' : 'Browser saves are unavailable. Export this world to keep it.', error);
export const newWorldId = () => globalThis.crypto?.randomUUID?.() || `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const newest = (a, b) => b.savedAt - a.savedAt || b.revision - a.revision;
const validMetadata = value => value && typeof value.id === 'string' && typeof value.worldId === 'string' && Number.isSafeInteger(value.revision) && Number.isFinite(value.savedAt);

/** IndexedDB transactions retain three checkpoints per world and twelve overall. */
export function createCheckpointStore({ name = 'pangea-checkpoints-v1', openDatabase = openDB, legacyStorage = () => globalThis.localStorage } = {}) {
  let connection, queue = Promise.resolve();
  const fallbackWorldId = newWorldId();
  const connect = async () => {
    if (!connection) {
      connection = openDatabase(name, 1, {
        upgrade(db) { db.createObjectStore('metadata', { keyPath: 'id' }); db.createObjectStore('snapshots', { keyPath: 'id' }); },
        blocking() { connection?.then(db => db.close()); connection = undefined; },
        terminated() { connection = undefined; },
      }).then(async db => {
        // Legacy data is removed only after a complete IndexedDB commit.
        let storage, raw;
        try { storage = legacyStorage(); raw = storage?.getItem(LEGACY_KEY); } catch { return db; }
        if (raw) {
          let snapshot;
          try { snapshot = Simulation.fromSnapshot(JSON.parse(raw)).snapshot(); } catch { return db; }
          try {
            const serialized = JSON.stringify(snapshot);
            const digest = globalThis.crypto?.subtle ? await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)) : null;
            const fingerprint = digest ? Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') : newWorldId();
            const id = `legacy-migration:${fingerprint}`;
            const tx = db.transaction(['metadata', 'snapshots'], 'readwrite');
            void tx.done.catch(() => {});
            // Always commit this exact source again before removing it, even if
            // an earlier migration has metadata but a missing/corrupt snapshot.
            await tx.objectStore('snapshots').put({ id, snapshot });
            await tx.objectStore('metadata').put({ id, worldId: `legacy-${snapshot.seed}`, revision: 1, savedAt: Date.now(), seed: snapshot.seed, tick: snapshot.tick, label: 'Imported browser save', paused: true, speed: 16 });
            await tx.done;
            if (storage.getItem(LEGACY_KEY) === raw) storage.removeItem(LEGACY_KEY);
          } catch { /* Keep the legacy save; the normal write reports quota failures. */ }
        }
        return db;
      }).catch(error => { connection = undefined; throw storageError(error); });
    }
    return connection;
  };
  const list = async () => {
    try { const db = await connect(); return (await db.getAll('metadata')).filter(validMetadata).sort(newest); }
    catch (error) { throw storageError(error); }
  };
  return {
    list,
    async latest() { return (await list())[0] || null; },
    save(snapshot, options = {}) {
      // Capture before joining the queue, so callers may immediately keep simulating.
      let captured;
      try { validateSave(snapshot); captured = structuredClone(snapshot); }
      catch (error) { return Promise.reject(new CheckpointError('invalid', 'This world could not be validated for saving.', error)); }
      const operation = queue.then(async () => {
        const db = await connect();
        const worldId = options.worldId || fallbackWorldId;
        if (typeof worldId !== 'string' || worldId.length > 120) throw new CheckpointError('invalid', 'Invalid world identifier.');
        const tx = db.transaction(['metadata', 'snapshots'], 'readwrite');
        void tx.done.catch(() => {});
        const metadataStore = tx.objectStore('metadata'), snapshotStore = tx.objectStore('snapshots');
        const all = (await metadataStore.getAll()).filter(validMetadata);
        const previous = all.filter(item => item.worldId === worldId).sort(newest)[0];
        if (options.expectedRevision !== undefined && (previous?.revision || 0) !== options.expectedRevision) {
          tx.abort(); await tx.done.catch(() => {});
          throw new CheckpointError('conflict', 'Another tab saved this world. Restore its checkpoint or save a new world.');
        }
        const revision = (previous?.revision || 0) + 1;
        const metadata = { id: `${worldId}:${revision}`, worldId, revision, savedAt: Math.max(Date.now(), ...all.map(item => item.savedAt + 1)), seed: captured.seed, tick: captured.tick,
          label: String(options.label || captured.scenario || 'PANGEA world').slice(0, 120), paused: options.paused !== false, speed: [1, 16, 64].includes(options.speed) ? options.speed : 16 };
        await snapshotStore.put({ id: metadata.id, snapshot: captured });
        await metadataStore.put(metadata);
        const combined = [metadata, ...all].sort(newest), counts = new Map();
        for (let i = 0; i < combined.length; i++) {
          const item = combined[i], count = (counts.get(item.worldId) || 0) + 1;
          counts.set(item.worldId, count);
          if (i >= 12 || count > 3) { await metadataStore.delete(item.id); await snapshotStore.delete(item.id); }
        }
        await tx.done;
        return metadata;
      }).catch(error => { throw storageError(error); });
      queue = operation.catch(() => {});
      return operation;
    },
    async load(id) {
      try {
        const db = await connect(), records = await list();
        const requested = id && records.find(item => item.id === id);
        const candidates = requested ? [requested, ...records.filter(item => item.worldId === requested.worldId && item.id !== id)] : id ? [] : records.filter(item => item.worldId === records[0]?.worldId);
        for (const metadata of candidates) {
          const saved = await db.get('snapshots', metadata.id);
          try { if (saved) return { ...metadata, formatVersion: 1, snapshot: Simulation.fromSnapshot(saved.snapshot).snapshot(), recovered: metadata.id !== candidates[0].id }; }
          catch { /* A prior atomic checkpoint may still be valid. */ }
        }
        if (candidates.length) throw new CheckpointError('corrupt', 'Saved checkpoints could not be validated. Import a previously exported world.');
        return null;
      } catch (error) { throw storageError(error); }
    },
    async remove(id) {
      try { const db = await connect(), tx = db.transaction(['metadata', 'snapshots'], 'readwrite'); await tx.objectStore('metadata').delete(id); await tx.objectStore('snapshots').delete(id); await tx.done; }
      catch (error) { throw storageError(error); }
    },
    async close() { if (connection) (await connection).close(); connection = undefined; },
  };
}
export const checkpointStore = createCheckpointStore();
