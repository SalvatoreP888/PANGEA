import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../src/pangea/simulation/sim.mjs';
import { openWorldStore } from './store.mjs';

class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
const hash = token => createHash('sha256').update(token).digest('hex');
const sameSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const bodyObject = value => { if (!value || Array.isArray(value) || typeof value !== 'object') fail(400, 'invalid', 'Expected a JSON object.'); return value; };
const speedValue = value => { if (![1, 16, 64].includes(value)) fail(400, 'invalid', 'Speed must be 1, 16 or 64.'); return value; };
const validatedSimulation = snapshot => {
  try { const sim = Simulation.fromSnapshot(snapshot); if (sim.invariants().length) throw new Error('Invariants'); return sim; }
  catch { fail(400, 'invalid_save', 'The world snapshot is invalid or incompatible.'); }
};
function readJson(request, limit) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') fail(415, 'content_type', 'Use application/json for server mutations.');
  if (Number(request.headers['content-length']) > limit) fail(413, 'too_large', 'The request exceeds the world import limit.');
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], rejected = false;
    request.on('data', chunk => {
      if (rejected) return;
      size += chunk.length;
      if (size > limit) { rejected = true; chunks = []; reject(new HttpError(413, 'too_large', 'The request exceeds the world import limit.')); }
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      try { resolve(bodyObject(JSON.parse(Buffer.concat(chunks).toString('utf8')))); }
      catch (error) { reject(error instanceof HttpError ? error : new HttpError(400, 'invalid_json', 'The request contains invalid JSON.')); }
    });
    request.on('error', () => reject(new HttpError(400, 'request_error', 'The request could not be read.')));
  });
}

/** A single authoritative process, with an independently scheduled and persisted game loop. */
export function createWorldServer({ dbPath, allowedOrigins = [], createKey = '', maxWorlds = 8, bodyLimit = 30 * 1024 * 1024,
  tickIntervalMs = 100, maxBatchSteps = 128, batchBudgetMs = 12, now = Date.now } = {}) {
  if (!dbPath) throw new Error('A durable SQLite path is required.');
  if (createKey && !/^[A-Za-z0-9_-]{16,256}$/.test(createKey)) throw new Error('The creation key must contain 16–256 letters, numbers, underscores or hyphens.');
  const store = openWorldStore(dbPath);
  let timer, lastError = null, stopping = false;
  const envelope = entry => ({ worldId: entry.row.id, revision: entry.row.revision, savedAt: entry.row.saved_at,
    paused: !!entry.row.paused, speed: entry.row.speed, snapshot: entry.sim.snapshot(), serverTime: now(), backlogTicks: Math.floor(entry.row.pending) });
  const runTick = () => {
    if (stopping) return;
    for (const entry of store.entries.values()) {
      if (entry.row.paused) continue;
      try {
        const time = now(), pending = entry.row.pending + Math.max(0, time - entry.row.wallclock) * entry.row.speed * 4 / 1000;
        const start = performance.now(); let count = 0;
        while (count < Math.floor(pending) && count < maxBatchSteps && performance.now() - start < batchBudgetMs) { entry.sim.step(); count++; }
        // Keep unprocessed elapsed time as an explicit durable backlog across crashes.
        store.commit(entry, { wallclock: time, pending: pending - count, saved_at: time });
      } catch (error) {
        // A simulation step can throw before commit starts. Never serve partial
        // in-memory progress under an old revision or replay it twice.
        entry.sim = Simulation.fromSnapshot(JSON.parse(entry.row.snapshot)); lastError = error;
      }
    }
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'Origin');
    const origin = request.headers.origin;
    try {
      // Do not trust Host as an origin allowlist: DNS rebinding can point an
      // attacker's hostname at a loopback service. Proxied origins are explicit.
      const port = server.address()?.port;
      const sameOrigin = origin && [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`].includes(origin);
      if (origin && !sameOrigin && !allowedOrigins.includes(origin)) fail(403, 'origin', 'This browser origin is not allowed by the world server.');
      if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.writeHead(204); response.end(); return;
      }
      const path = new URL(request.url, 'http://localhost').pathname;
      let status = 200, result;
      if (path === '/health' && request.method === 'GET') result = { ok: !lastError, runtime: 'node-sqlite', worlds: store.entries.size, ...(lastError ? { error: 'A world checkpoint failed. Inspect server logs and disk health.' } : {}) };
      else if (path === '/api/worlds' && request.method === 'POST') {
        const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,256})$/)?.[1];
        if (createKey && !sameSecret(bearer, createKey)) fail(401, 'unauthorized', 'A server creation key is required.');
        if (store.entries.size >= maxWorlds) fail(409, 'capacity', 'The server has reached its world capacity.');
        const body = await readJson(request, bodyLimit);
        if (body.seed !== undefined && (!Number.isInteger(body.seed) || body.seed < 0 || body.seed > 2147483647)) fail(400, 'invalid', 'Seed must be an integer between 0 and 2147483647.');
        if (body.paused !== undefined && typeof body.paused !== 'boolean') fail(400, 'invalid', 'Paused must be true or false.');
        const sim = body.snapshot === undefined ? new Simulation(body.seed ?? randomBytes(4).readUInt32LE() % 2147483647) : validatedSimulation(body.snapshot);
        const time = now(), token = randomBytes(32).toString('base64url');
        const row = { id: randomBytes(16).toString('hex'), token_hash: hash(token), snapshot: JSON.stringify(sim.snapshot()), revision: 1,
          paused: body.paused === false ? 0 : 1, speed: speedValue(body.speed ?? 16), wallclock: time, pending: 0, saved_at: time };
        // Another request may have finished reading its body in the meantime.
        if (store.entries.size >= maxWorlds) fail(409, 'capacity', 'The server has reached its world capacity.');
        const entry = store.create(row, sim); status = 201; result = { ...envelope(entry), token };
      } else {
        const match = path.match(/^\/api\/worlds\/([a-f0-9]{32})(\/commands)?$/);
        if (!match) fail(404, 'not_found', 'World endpoint not found.');
        const entry = store.entries.get(match[1]);
        const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,256})$/)?.[1];
        if (!entry || !bearer || !timingSafeEqual(Buffer.from(hash(bearer)), Buffer.from(entry.row.token_hash))) fail(401, 'unauthorized', 'World ID or private key is incorrect.');
        if (!match[2] && request.method === 'GET') result = envelope(entry);
        else if (match[2] && request.method === 'POST') {
          const body = await readJson(request, bodyLimit);
          if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1) fail(400, 'revision', 'An expected world revision is required.');
          const command = bodyObject(body.command),time=now();
          // Implicit idempotent controls may cross clock commits, never another
          // control/import. Explicit CAS and all imports retain exact revisions.
          const clockOnly=body.allowClockAdvance===true&&['pause','resume','speed'].includes(command.type)&&body.expectedRevision>=entry.controlRevision&&body.expectedRevision<=entry.row.revision;
          if (body.expectedRevision !== entry.row.revision&&!clockOnly) {
            const error = new HttpError(409, 'conflict', 'The world advanced before this command. Refresh its state and try again. Imports require reviewing the latest world first.');
            error.revision = entry.row.revision; throw error;
          }
          const updates = { saved_at: time, wallclock: time,
            pending: entry.row.pending + (entry.row.paused ? 0 : Math.max(0, time - entry.row.wallclock) * entry.row.speed * 4 / 1000) };
          if (command.type === 'pause') updates.paused = 1;
          else if (command.type === 'resume') updates.paused = 0;
          else if (command.type === 'speed') updates.speed = speedValue(command.speed);
          else if (command.type === 'import') { const sim = validatedSimulation(command.snapshot); entry.sim = sim; updates.paused = 1; updates.pending = 0; }
          else fail(400, 'command', 'Unknown world command.');
          store.commit(entry, updates);entry.controlRevision=entry.row.revision;result = envelope(entry);
        } else fail(405, 'method', 'Method not allowed.');
      }
      response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) lastError = error;
      if (!response.headersSent) response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: status === 500 ? 'The server could not commit this world. Its previous checkpoint was retained.' : error.message,
        code: error instanceof HttpError ? error.code : 'server', ...(Number.isSafeInteger(error.revision) ? { revision: error.revision } : {}) }));
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  return {
    server, runTick,
    async start({ host = '127.0.0.1', port = 8787 } = {}) {
      if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !createKey) throw new Error('Set PANGEA_CREATE_KEY before exposing a non-loopback server.');
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
      timer = setInterval(runTick, tickIntervalMs); timer.unref(); return server.address();
    },
    async stop() {
      if (stopping) return;
      clearInterval(timer); runTick(); stopping = true;
      if (server.listening) await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
      store.close();
    },
  };
}
