'use client';
import { useEffect, useRef, useState } from 'react';
import type { WorldState } from '../model';
import { RemoteWorldClient, type RemoteEnvelope } from '../persistence/index.mjs';
import './world-connection.css';

interface Props {
  snapshot: () => WorldState | null;
  connected: boolean;
  onConnect: (client: RemoteWorldClient, envelope: RemoteEnvelope) => void;
  onDisconnect: () => void;
}
export default function WorldConnection({ snapshot, connected, onConnect, onDisconnect }: Props) {
  const mounted = useRef(true), attempt = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [stored] = useState(() => RemoteWorldClient.configured());
  const [endpoint, setEndpoint] = useState(stored?.endpoint || 'http://127.0.0.1:8787');
  const [worldId, setWorldId] = useState(stored?.worldId || '');
  const [token, setToken] = useState(stored?.token || '');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const connect = async (create: boolean) => {
    const request = ++attempt.current;
    setBusy(true); setMessage('');
    try {
      const client = new RemoteWorldClient(endpoint, { worldId: worldId.trim(), token: token.trim() });
      const current = create ? snapshot() : null;
      if (create && !current) throw new Error('Wait for the world to finish loading.');
      const envelope = create ? await client.create({ snapshot: current!, paused: true, speed: 16 }) : await client.connect();
      if (!mounted.current || request !== attempt.current) return;
      setWorldId(client.worldId); setToken(client.token);
      onConnect(client, envelope);
      setMessage(create ? 'Server world created. Keep its world ID and private key to reconnect from another device.' : 'Connected. The server owns this world’s clock.');
    } catch (error) { if (mounted.current && request === attempt.current) setMessage(error instanceof Error ? error.message : 'The server connection failed.'); }
    finally { if (mounted.current && request === attempt.current) setBusy(false); }
  };
  const copyConnection = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify({ endpoint, worldId, token }, null, 2)); setMessage('Connection details copied, including the private key. Share them only with someone who may control this world.'); }
    catch { setMessage('This browser could not copy the connection. The world ID and key remain saved on this device.'); }
  };
  return <details className="world-connection">
    <summary>Persistent server world <span>{connected ? 'Connected' : 'Optional'}</span></summary>
    <p>A running world server keeps time after this page closes. This preview uses browser saves until you connect one.</p>
    <label>Server URL<input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://worlds.example.com" autoComplete="off" disabled={busy || connected}/></label>
    <label>World ID<input value={worldId} onChange={event => setWorldId(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy || connected}/></label>
    <label>Private key<input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy || connected}/></label>
    <p className="world-connection-note">For a new world, enter your server’s creation key if it requires one. Keep the returned private key safe; anyone holding it can control this world. It is saved only in this browser.</p>
    <div className="world-connection-actions">{connected ? <><button type="button" onClick={onDisconnect}>Disconnect to local copy</button><button type="button" onClick={() => void copyConnection()}>Copy connection details</button></> : <>
      <button type="button" onClick={() => void connect(false)} disabled={busy || !worldId.trim() || !token.trim()}>{busy ? 'Connecting…' : 'Rejoin world'}</button>
      <button type="button" onClick={() => void connect(true)} disabled={busy || !endpoint.trim()}>Create server world</button>
    </>}</div>
    {message && <p role="status" className="world-connection-status">{message}</p>}
  </details>;
}
