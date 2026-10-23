# Persistent worlds

PANGEA has device-local checkpoints and an optional authoritative Node server. The current static Site runs the browser app; it does not host the Node server. A server world continues after every browser closes only while its separately hosted process is running. No permanent server infrastructure or paid service has been provisioned by this change.

## Browser saves

World settings exposes Save in browser, Load saved world, recent checkpoints and portable JSON import/export. IndexedDB autosaves every15seconds and attempts a save when the page becomes hidden. Completed saves have atomic metadata/content; three checkpoints per world and twelve overall are retained. Restore explicitly forks a local copy, preserving the saved branch. Fresh launches still generate a new random preview.

IndexedDB belongs to this browser profile and origin. Clearing site data, changing devices or using a different URL does not transfer it. Export JSON for a portable backup. If the browser denies storage or quota is full, PANGEA reports that the save failed and keeps the current world running. A tab closing cannot guarantee completion of a newly started asynchronous save. The old localStorage slot migrates only after a validated IndexedDB commit.

## Run the real server

Use Node24.15 or newer. No extra npm server packages are required. From the repository root:

```sh
node server/index.mjs
```

Default endpoint is `http://127.0.0.1:8787`; the database is `server/var/pangea-worlds.sqlite`, which is gitignored. The process keeps running until stopped. Frontend and server are separate processes; `next start` alone does not start authoritative ticking.

Set the exact frontend origin before starting it, for example during local development:

```sh
PANGEA_ALLOWED_ORIGINS=http://127.0.0.1:3000 node server/index.mjs
```

Then open World settings → Persistent server world, enter the endpoint and Create server world. This copies the current validated world to the server in paused state. Resume it through the normal playback control. While connected, the browser renders polled server snapshots and stops simulating its own copy. Pause, speed and import use server commands. Server imports are paused, validate before replacement and reject stale revisions. A disconnected server connection does not upload local progress over its authoritative state.

The server returns a world ID and a private key. Both are saved only in the connecting browser. Copy connection details explicitly to keep the key or move to another device; enter the same server URL, world ID and private key and select Rejoin world there. This is possession-based access: anyone with that key controls the world. Losing it requires restoring a backup as a new world; key recovery/rotation and account membership management are not implemented. Explicit Disconnect creates a paused local copy and clears the saved connection preference; it does not pause or delete the server world.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PANGEA_DB_PATH` | `server/var/pangea-worlds.sqlite` | Durable SQLite file path. |
| `PANGEA_HOST` | `127.0.0.1` | Bind address. Non-loopback binding requires a creation key. |
| `PANGEA_PORT` | `8787` | HTTP port. |
| `PANGEA_ALLOWED_ORIGINS` | empty | Comma-separated, exact browser origins including scheme/port. No wildcard; proxied frontend origins must be listed explicitly. |
| `PANGEA_CREATE_KEY` | empty for loopback only | Private server provisioning key:16–256 letters, numbers, underscores or hyphens. New-world requests require it; returned world keys remain separate. |

Generate provisioning secrets privately and supply them through the process environment or an untracked environment file. Do not place them in source, shell history, public client bundles, query strings or logs. Node supports `node --env-file=server/.env server/index.mjs`; the file is ignored. On a keyed server, enter the creation key in the Private key field before creating a world. It is replaced locally by the returned per-world key.

Only loopback HTTP is accepted by the browser client. A remote endpoint requires HTTPS. For a real deployment use a trusted TLS reverse proxy, an unprivileged supervised Node process, an exact frontend-origin allowlist and a persistent disk. Example layout: source at `/opt/pangea`, database under `/var/lib/pangea`, environment in a protected service configuration, and reverse proxy `https://worlds.example.com` to127.0.0.1:8787. Configure the frontend to connect to that HTTPS endpoint. Keep `/health` available for monitoring; it reports checkpoint failures without private data. Run one authoritative process per database; this implementation does not coordinate multiple competing runners.

SQLite uses WAL, FULL synchronous commits and prepared parameters. Stop the server cleanly before copying the database, or use SQLite’s online backup tooling. A live `.sqlite` file copied without its WAL can miss committed data. Keep an external backup separately from the three in-database recovery checkpoints. Recovery validates snapshots and invariants; when it uses a recovery checkpoint, it pauses the world rather than guessing lost progression.

The scheduler checks every100ms, caps each world at128steps and a12ms work budget, and persists unprocessed elapsed time as backlog. After a crash it resumes bounded catch-up from the saved clock, even with no connected page. Paused worlds do not accrue new time. Sustained backlog means the selected rate or world count exceeds that machine’s capacity; faster hardware or a lower rate is needed. Large populations are not a scale guarantee. The current server caps worlds at8 and imports at30MiB. It has no world-deletion/admin UI or multiplayer roles yet.

## API

All mutations require JSON. World routes require `Authorization: Bearer <private-key>`; keys never belong in the URL. An optional creation key protects provisioning. The browser client handles encoding, validation, request timeouts and bounded idempotent control retries.

| Method/path | Request | Result |
| --- | --- | --- |
| `GET /health` | none | Health and world count; no snapshots/keys. |
| `POST /api/worlds` | `{seed? ,snapshot?,paused?,speed?}` | New world envelope plus its one-time returned private key. |
| `GET /api/worlds/:id` | owner authorization | Current authoritative envelope. |
| `POST /api/worlds/:id/commands` | `{expectedRevision,command}` | Updated envelope or409 for a stale revision. Commands: `pause`, `resume`, `speed` with1/16/64, and `import` with validated `snapshot`. |

Envelopes contain `worldId`, `revision`, `savedAt`, `paused`, `speed`, `snapshot`, `serverTime` and `backlogTicks`. A world key is only included when first created. The snapshot is the same portable format used by local saves.

## Existing Sites hosting

Sites supports Worker request handlers and D1/R2 storage, with trusted `oai-authenticated-user-id` for user-owned records. The current project is static. No supported cron, queue or Durable Object binding was established from the available Sites documentation/tool surface; a Worker’s request-local interval is not a permanent simulation process. Scheduled cloud tasks can call an authenticated writer for periodic catch-up, but that is different from a continuous game loop.

D1’s maximum string/BLOB/row is2,000,000bytes ([official limits](https://developers.cloudflare.com/d1/platform/limits/)). Existing PANGEA fixture saves already reach2.99MB and4.56MB, so a one-row snapshot design fails today. A future hosted Worker version needs immutable R2 snapshot objects plus metadata CAS/recovery, or an atomic chunk manifest, and a verified background scheduler. It must also measure Worker CPU/memory with real populations. Node SQLite and native SQLite addons cannot be deployed into that Worker runtime. The runnable Node service is the supported authoritative implementation in this change.

## Verification

```sh
node --test tests/pangea/persistence.test.mjs
python3 tests/pangea/persistence-browser.py
PANGEA_URL=http://127.0.0.1:3002/ python3 tests/pangea/server-browser.py
```

The Node tests open real temporary SQLite files and HTTP sockets: access control, CORS/DNS rebinding, capacity/body bounds, command/import validation, revision conflicts, no-client ticking, fastest-rate capacity, bounded restart catch-up, persisted pause, deterministic continuation, a corrupt-primary-snapshot recovery and recovery after a thrown simulation step. Chromium tests use real IndexedDB for atomic rotating checkpoints, overlapping saves, stale revisions, corrupted-checkpoint recovery and legacy migration. The frontend/server smoke creates a world through the real UI, closes the page, confirms server progression, rejoins, pauses and disconnects. It also imports a different same-seed world with fewer towns and verifies that delayed command/polling responses cannot overwrite a disconnected local world. The last command needs a running frontend; it starts/stops its own temporary backend.

See [OSS sources and licenses](oss/persistence.md) for the researched alternatives and exact integrated revision.
