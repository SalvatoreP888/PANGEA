import { resolve } from 'node:path';
import { createWorldServer } from './app.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 15)) throw new Error('The world server requires Node24.15 or newer.');
if (process.env.PANGEA_CREATE_KEY && !/^[A-Za-z0-9_-]{16,256}$/.test(process.env.PANGEA_CREATE_KEY)) throw new Error('PANGEA_CREATE_KEY must contain16–256 letters, numbers, underscores or hyphens.');
const app = createWorldServer({ dbPath: resolve(process.env.PANGEA_DB_PATH || 'server/var/pangea-worlds.sqlite'),
  createKey: process.env.PANGEA_CREATE_KEY || '', allowedOrigins: (process.env.PANGEA_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean) });
const address = await app.start({ host: process.env.PANGEA_HOST || '127.0.0.1', port: Number(process.env.PANGEA_PORT || 8787) });
console.log(`PANGEA world server listening on ${address.address}:${address.port}. Private keys are never logged.`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.stop(); process.exit(0); });
