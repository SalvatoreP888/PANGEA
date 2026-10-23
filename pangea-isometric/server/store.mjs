import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Simulation } from '../src/pangea/simulation/sim.mjs';

const restore = snapshot => { const sim = Simulation.fromSnapshot(JSON.parse(snapshot)); if (sim.invariants().length) throw new Error('Invalid checkpoint invariants.'); return sim; };

export function openWorldStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, snapshot TEXT NOT NULL, revision INTEGER NOT NULL,
      paused INTEGER NOT NULL CHECK(paused IN (0,1)), speed INTEGER NOT NULL CHECK(speed IN (1,16,64)),
      wallclock REAL NOT NULL, pending REAL NOT NULL DEFAULT 0, saved_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS world_checkpoints (
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
      snapshot TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(world_id,revision)
    ) STRICT;`);
  const entries = new Map();
  for (const row of db.prepare('SELECT * FROM worlds').all()) {
    let sim;
    try { sim = restore(row.snapshot); }
    catch {
      for (const backup of db.prepare('SELECT snapshot FROM world_checkpoints WHERE world_id=? ORDER BY revision DESC').all(row.id)) {
        try { sim = restore(backup.snapshot); row.snapshot = backup.snapshot; break; } catch { /* Try an older validated checkpoint. */ }
      }
      if (!sim) throw new Error(`No valid recovery checkpoint for world ${row.id}. Restore a database backup.`);
      // Do not replay the corrupt row's clock against an older snapshot.
      // Recovery replaces authoritative state, so connected readers must see a
      // newer revision even when the recovered checkpoint is older. Retain the
      // checkpoint history unchanged; this one conditional UPDATE is atomic.
      const priorRevision=row.revision,recoveredAt=Date.now();
      row.pending = 0; row.paused = 1; row.wallclock = recoveredAt;row.saved_at=recoveredAt;row.revision=priorRevision+1;
      const result=db.prepare('UPDATE worlds SET snapshot=?,revision=?,paused=1,pending=0,wallclock=?,saved_at=? WHERE id=? AND revision=?')
        .run(row.snapshot,row.revision,row.wallclock,row.saved_at,row.id,priorRevision);
      if(Number(result.changes)!==1)throw new Error('The world was updated during recovery. Run a single authoritative process per database.');
    }
    // Normalize legacy saves once for the wire without rewriting durable history.
    // Usually these bytes already equal the row; retain its string in that case.
    const canonical=JSON.stringify(sim.state),snapshotJson=canonical===row.snapshot?row.snapshot:canonical;
    // On restart conservatively require a revision at least as new as this load.
    entries.set(row.id, { row, sim, snapshotJson, controlRevision:row.revision });
  }
  const checkpoint = row => {
    db.prepare('INSERT INTO world_checkpoints(world_id,revision,snapshot,saved_at) VALUES (?,?,?,?)').run(row.id, row.revision, row.snapshot, row.saved_at);
    db.prepare('DELETE FROM world_checkpoints WHERE world_id=? AND revision NOT IN (SELECT revision FROM world_checkpoints WHERE world_id=? ORDER BY revision DESC LIMIT 3)').run(row.id, row.id);
  };
  return {
    entries,
    create(row, sim) {
      try {
        db.exec('BEGIN IMMEDIATE');
        db.prepare('INSERT INTO worlds VALUES (?,?,?,?,?,?,?,?,?)').run(row.id, row.token_hash, row.snapshot, row.revision, row.paused, row.speed, row.wallclock, row.pending, row.saved_at);
        checkpoint(row); db.exec('COMMIT');
      } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
      const entry = { row, sim, snapshotJson:row.snapshot, controlRevision:row.revision }; entries.set(row.id, entry); return entry;
    },
    commit(entry, updates) {
      try {
        // The simulation owns plain JSON state. Serialize once; snapshot() also
        // deep-clones for callers, which a synchronous durable write does not need.
        const row = { ...entry.row, ...updates, snapshot: JSON.stringify(entry.sim.state), revision: entry.row.revision + 1 };
        db.exec('BEGIN IMMEDIATE');
        const result = db.prepare('UPDATE worlds SET snapshot=?,revision=?,paused=?,speed=?,wallclock=?,pending=?,saved_at=? WHERE id=? AND revision=?')
          .run(row.snapshot, row.revision, row.paused, row.speed, row.wallclock, row.pending, row.saved_at, row.id, entry.row.revision);
        if (Number(result.changes) !== 1) throw new Error('The world was updated by another server. Run a single authoritative process per database.');
        checkpoint(row); db.exec('COMMIT'); entry.row = row;entry.snapshotJson=row.snapshot;
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        entry.sim = Simulation.fromSnapshot(JSON.parse(entry.row.snapshot));
        throw error;
      }
    },
    close() { db.close(); },
  };
}
