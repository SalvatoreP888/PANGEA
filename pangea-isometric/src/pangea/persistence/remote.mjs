import { Simulation } from '../simulation/sim.mjs';

const CONFIG_KEY = 'pangea-server-connection-v1';
export class RemoteWorldError extends Error {
  constructor(message, status = 0, code = 'connection') { super(message); this.name = 'RemoteWorldError'; this.status = status; this.code = code; }
}
function endpointUrl(endpoint) {
  const url = new URL(endpoint);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new RemoteWorldError('Use a server URL without credentials, query parameters or fragments.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new RemoteWorldError('Remote servers require HTTPS to protect your private key.');
  return url.href.replace(/\/+$/, '');
}
function savedConfiguration() {
  try { const value = JSON.parse(globalThis.localStorage?.getItem(CONFIG_KEY) || 'null'); return value && typeof value.endpoint === 'string' && typeof value.worldId === 'string' && typeof value.token === 'string' ? value : null; }
  catch { return null; }
}
export class RemoteWorldClient {
  constructor(endpoint, { token, worldId } = {}) {
    this.endpoint = endpointUrl(endpoint);
    const stored = savedConfiguration();
    const match = stored?.endpoint === this.endpoint && (!worldId || stored.worldId === worldId);
    this.token = token ?? (match ? stored.token : '');
    this.worldId = worldId ?? (match ? stored.worldId : '');
    this.revision = 0;
  }
  static configured() { return savedConfiguration(); }
  remember() {
    try { globalThis.localStorage?.setItem(CONFIG_KEY, JSON.stringify({ endpoint: this.endpoint, worldId: this.worldId, token: this.token })); }
    catch { /* A key can still be copied manually when browser storage is denied. */ }
  }
  async request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${this.endpoint}${path}`, { method, signal: controller.signal, cache: 'no-store', credentials: 'omit',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new RemoteWorldError(typeof result.error === 'string' ? result.error : 'The server could not complete this request.', response.status, result.code);
        error.revision = result.revision; throw error;
      }
      if (!result || typeof result.worldId !== 'string' || !Number.isSafeInteger(result.revision) || typeof result.paused !== 'boolean' || ![1, 16, 64].includes(result.speed)) throw new RemoteWorldError('The server returned an invalid world.');
      // Never let unvalidated remote data reach the renderer.
      const snapshot = Simulation.fromSnapshot(result.snapshot).snapshot();
      this.revision = result.revision;
      return { ...result, snapshot };
    } catch (error) {
      if (error instanceof RemoteWorldError) throw error;
      throw new RemoteWorldError(error?.name === 'AbortError' ? 'The server took too long to respond. Your server world keeps its last checkpoint.' : 'Cannot reach this world server. Check its URL, CORS origin and connection.');
    } finally { clearTimeout(timeout); }
  }
  async create(options = {}) {
    const envelope = await this.request('/api/worlds', { method: 'POST', body: options });
    if (typeof envelope.token !== 'string' || envelope.token.length < 32) throw new RemoteWorldError('The server did not return a private world key.');
    this.worldId = envelope.worldId; this.token = envelope.token; this.remember();
    return envelope;
  }
  async read() {
    if (!this.worldId || !this.token) throw new RemoteWorldError('Enter the world ID and private key to connect.', 401, 'unauthorized');
    return this.request(`/api/worlds/${encodeURIComponent(this.worldId)}`);
  }
  async connect() { const result = await this.read(); this.remember(); return result; }
  async command(command, expectedRevision) {
    if (!this.worldId || !this.token) throw new RemoteWorldError('Connect to a server world first.', 401, 'unauthorized');
    const explicit = expectedRevision !== undefined;
    // Clock-only advancement is handled atomically by the server. A remaining
    // conflict means the reviewed controls/world may have changed: never retry
    // it blindly against a newly imported world or another user's command.
    return this.request(`/api/worlds/${encodeURIComponent(this.worldId)}/commands`, { method: 'POST', body: { expectedRevision: expectedRevision ?? this.revision, command, ...(!explicit&&command.type!=='import'?{allowClockAdvance:true}:{}) } });
  }
  disconnect() {
    const stored = savedConfiguration();
    if (stored?.endpoint === this.endpoint && stored?.worldId === this.worldId) {
      try { globalThis.localStorage?.removeItem(CONFIG_KEY); } catch { /* Optional local preference. */ }
    }
  }
}
