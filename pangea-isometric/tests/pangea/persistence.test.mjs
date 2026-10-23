import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { createWorldServer } from '../../server/app.mjs';
import { Simulation } from '../../src/pangea/simulation/sim.mjs';
import { createCheckpointStore, CheckpointError } from '../../src/pangea/persistence/checkpoints.mjs';
import { RemoteWorldClient } from '../../src/pangea/persistence/remote.mjs';

async function fixture(t, options = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'pangea-server-test-'));
  const dbPath = join(folder, 'worlds.sqlite');
  let app = createWorldServer({ dbPath, tickIntervalMs: 100000, ...options });
  let address = await app.start({ port: 0 });
  let endpoint = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await app.stop(); rmSync(folder, { recursive: true, force: true }); });
  return {
    get app() { return app; }, get endpoint() { return endpoint; }, dbPath,
    client: () => new RemoteWorldClient(endpoint),
    async restart(next = {}) { await app.stop(); app = createWorldServer({ dbPath, tickIntervalMs: 100000, ...options, ...next }); address = await app.start({ port: 0 }); endpoint = `http://127.0.0.1:${address.port}`; },
  };
}
const request = (endpoint, path, { token, body, origin, method = body ? 'POST' : 'GET' } = {}) => fetch(endpoint + path, {
  method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('server creates a protected world and private keys authorize every read and mutation', async t => {
  const f = await fixture(t), client = f.client();
  const created = await client.create({ seed: 481217 });
  assert.equal(created.snapshot.seed, 481217); assert.equal(created.paused, true); assert.equal(created.revision, 1);
  const path = `/api/worlds/${created.worldId}`;
  assert.equal((await request(f.endpoint, path)).status, 401);
  assert.equal((await request(f.endpoint, path, { token: 'wrong-private-key-12345678' })).status, 401);
  assert.equal((await request(f.endpoint, path + '/commands', { body: { expectedRevision: 1, command: { type: 'resume' } } })).status, 401);
  const read = await client.read(); assert.deepEqual(read.snapshot, created.snapshot); assert.equal(read.token, undefined);
});

test('server validates commands, imports and optimistic revisions without replacing a valid world', async t => {
  const f = await fixture(t), client = f.client(), created = await client.create({ seed: 2026 });
  const path = `/api/worlds/${created.worldId}/commands`;
  for (const command of [{ type: 'speed', speed: 100000 }, { type: 'arbitrary' }, { type: 'import', snapshot: { version: 3 } }]) {
    const response = await request(f.endpoint, path, { token: client.token, body: { expectedRevision: created.revision, command } });
    assert.equal(response.status, 400); assert.equal((await client.read()).revision, 1);
  }
  const speed = await client.command({ type: 'speed', speed: 64 }); assert.equal(speed.speed, 64);
  const stale = await request(f.endpoint, path, { token: client.token, body: { expectedRevision: 1, command: { type: 'resume' } } });
  assert.equal(stale.status, 409); assert.equal((await client.read()).paused, true);
  const replacement = new Simulation(77); replacement.step(8);
  const imported = await client.command({ type: 'import', snapshot: replacement.snapshot() });
  assert.equal(imported.snapshot.seed, 77); assert.equal(imported.snapshot.tick, 8); assert.equal(imported.paused, true);
});

test('independent server scheduler advances a running world with no client connected', async t => {
  const f = await fixture(t, { tickIntervalMs: 25, batchBudgetMs: 100 });
  const client = f.client(), created = await client.create({ seed: 123, speed: 64, paused: false });
  await delay(160); // No browser or requests are needed while the timer runs.
  const after = await client.read(); assert.ok(after.snapshot.tick > created.snapshot.tick); assert.ok(after.revision > created.revision);
  const paused = await client.command({ type: 'pause' });
  await delay(80); assert.equal((await client.read()).snapshot.tick, paused.snapshot.tick);
});

test('SQLite restart retains keys and paused state; crash downtime catchup is bounded and explicit', async t => {
  let time = 1000000;
  const f = await fixture(t, { now: () => time, maxBatchSteps: 7, batchBudgetMs: 100 });
  const first = f.client(), created = await first.create({ seed: 481217, speed: 1, paused: false });
  const token = first.token, worldId = first.worldId;
  await f.restart(); time += 60000; f.app.runTick();
  const reconnected = new RemoteWorldClient(f.endpoint, { token, worldId }), after = await reconnected.read();
  assert.equal(after.snapshot.tick, 7); assert.equal(after.backlogTicks, 233);
  const uninterrupted = new Simulation(481217); uninterrupted.step(7); assert.deepEqual(after.snapshot, uninterrupted.snapshot());
  await reconnected.command({ type: 'pause' }); await f.restart(); time += 60000; f.app.runTick();
  const paused = await new RemoteWorldClient(f.endpoint, { token, worldId }).read(); assert.equal(paused.paused, true); assert.equal(paused.snapshot.tick, 7);
  assert.equal(paused.snapshot.seed, created.snapshot.seed);
});

test('CORS rejects untrusted origins and allows only configured browser origins', async t => {
  const f = await fixture(t, { allowedOrigins: ['https://pangea.example'] });
  const denied = await request(f.endpoint, '/api/worlds', { origin: 'https://untrusted.example', body: { seed: 123 } });
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  const preflight = await request(f.endpoint, '/api/worlds', { method: 'OPTIONS', origin: 'https://pangea.example' });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://pangea.example');
  const created = await request(f.endpoint, '/api/worlds', { origin: 'https://pangea.example', body: { seed: 123 } }); assert.equal(created.status, 201);
  const rebinding = await fetch(f.endpoint + '/api/worlds', { method: 'POST', headers: { Host: 'attacker.example', Origin: 'http://attacker.example', 'Content-Type': 'application/json' }, body: '{"seed":123}' });
  assert.equal(rebinding.status, 403);
});

test('default scheduler step capacity sustains the fastest selectable speed', async t => {
  let time = 1000000;
  const f = await fixture(t, { now: () => time }), client = f.client();
  await client.create({ seed: 481217, paused: false, speed: 64 });
  for (let i = 0; i < 10; i++) { time += 100; f.app.runTick(); }
  const after = await client.read();
  assert.equal(after.snapshot.tick + after.backlogTicks, 256);
  assert.ok(after.snapshot.tick >= 240, `default loop fell behind: ${after.snapshot.tick} ticks, backlog ${after.backlogTicks}`);
});

test('failed simulation steps restore the committed state before serving or retrying', async t => {
  let time = 1000000;
  const f = await fixture(t, { now: () => time }), client = f.client();
  await client.create({ seed: 481217, paused: false, speed: 1 });
  const original = Simulation.prototype.step;
  try {
    Simulation.prototype.step = function () { original.call(this); throw new Error('injected step failure'); };
    time += 1000; f.app.runTick();
    const retained = await client.read(); assert.equal(retained.snapshot.tick, 0); assert.equal(retained.revision, 1);
  } finally { Simulation.prototype.step = original; }
  f.app.runTick(); assert.equal((await client.read()).snapshot.tick, 4);
});

test('a corrupt primary SQLite snapshot recovers a validated checkpoint and pauses safely', async t => {
  const f = await fixture(t), client = f.client(), created = await client.create({ seed: 481217, paused: false });
  const token = client.token, worldId = client.worldId;
  await f.app.stop();
  const db = new DatabaseSync(f.dbPath);
  db.prepare('UPDATE worlds SET snapshot=? WHERE id=?').run('{"version":3,"corrupt":true}', worldId); db.close();
  await f.restart();
  const recovered = await new RemoteWorldClient(f.endpoint, { token, worldId }).read();
  assert.equal(recovered.snapshot.seed, created.snapshot.seed); assert.equal(recovered.paused, true);
  assert.deepEqual(Simulation.fromSnapshot(recovered.snapshot).invariants(), []);
});

test('server creation key and body limit prevent anonymous provisioning and oversized imports', async t => {
  const f = await fixture(t, { createKey: 'server-creation-key-123456789', bodyLimit: 1024, maxWorlds: 1 });
  assert.equal((await request(f.endpoint, '/api/worlds', { body: { seed: 1 } })).status, 401);
  assert.equal((await request(f.endpoint, '/api/worlds', { token: 'server-creation-key-123456789', body: { snapshot: 'x'.repeat(1100) } })).status, 413);
  assert.equal((await request(f.endpoint, '/api/worlds', { token: 'server-creation-key-123456789', body: { seed: 1 } })).status, 201);
  assert.equal((await request(f.endpoint, '/api/worlds', { token: 'server-creation-key-123456789', body: { seed: 2 } })).status, 409);
});

test('concurrent creates cannot exceed the configured world capacity', async t => {
  const f = await fixture(t, { maxWorlds: 1 });
  const responses = await Promise.all([1, 2, 3].map(seed => request(f.endpoint, '/api/worlds', { body: { seed } })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409, 409]);
});

test('checkpoint storage reports denied/quota failures and never removes a legacy save before commit', async () => {
  const blocked = createCheckpointStore({ openDatabase: async () => { const error = new Error('denied'); error.name = 'SecurityError'; throw error; } });
  await assert.rejects(blocked.list(), error => error instanceof CheckpointError && error.code === 'unavailable');
  const full = createCheckpointStore({ openDatabase: async () => { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; } });
  await assert.rejects(full.save(new Simulation(123).snapshot()), error => error.code === 'quota');
  let removed = false;
  const legacy = createCheckpointStore({ legacyStorage: () => ({ getItem: () => JSON.stringify(new Simulation(123).snapshot()), removeItem: () => { removed = true; } }),
    openDatabase: async () => ({ transaction() { throw new Error('quota during migration'); }, getAll: async () => [] }) });
  assert.deepEqual(await legacy.list(), []); assert.equal(removed, false);
});
