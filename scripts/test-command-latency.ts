import WebSocket from 'ws';

const baseUrl = (process.env.SIM_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const wsBaseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

type AuthResult = { token: string; userId: string; deviceId: string; role: string };

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}

function connect(token: string, label: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws?token=${encodeURIComponent(token)}`);
    const timeout = setTimeout(() => reject(new Error(`${label} WS timeout`)), 8000);
    ws.once('open', () => { clearTimeout(timeout); resolve(ws); });
    ws.once('error', (e) => { clearTimeout(timeout); reject(e); });
  });
}

async function main() {
  const suffix = Date.now();
  const email = `latency-${suffix}@hybridcontrol.test`;
  const password = `LatPass-${suffix}!`;

  // Register owner (dashboard) device
  const owner = await api<AuthResult>('/api/auth/register', {
    email, password,
    device: { deviceId: `dash-lat-${suffix}`, deviceName: 'Dashboard', model: 'Node', osVersion: process.version, sdkVersion: 0, manufacturer: 'Test' },
  });

  // Login as android device
  const client = await api<AuthResult>('/api/auth/login', {
    email, password,
    device: { deviceId: `android-lat-${suffix}`, deviceName: 'Android Latency', model: 'Pixel', osVersion: 'API 34', sdkVersion: 34, manufacturer: 'Test' },
  });

  const dashWs = await connect(owner.token, 'dashboard');
  const androidWs = await connect(client.token, 'android');

  // Wait for both connections to stabilize
  await new Promise((r) => setTimeout(r, 500));

  const results: number[] = [];
  const ROUNDS = 10;

  for (let i = 0; i < ROUNDS; i++) {
    const commandId = `cmd-${suffix}-${i}`;
    const sentAt = performance.now();

    // Android listens for the command from dashboard
    const received = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Command ${i} timed out`)), 5000);
      const handler = (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString());
          // Backend sends { type: 'COMMAND', payload: { id, type, payload: { ... commandId }, fromDeviceId } }
          if (msg.type === 'COMMAND' && msg.payload?.payload?.commandId === commandId) {
            clearTimeout(timeout);
            androidWs.off('message', handler);
            resolve(performance.now() - sentAt);
          }
        } catch { /* ignore non-JSON */ }
      };
      androidWs.on('message', handler);
    });

    // Dashboard sends command via REST API
    await fetch(`${baseUrl}/api/devices/${client.deviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ type: 'TOUCH', payload: { x: 100, y: 200, commandId } }),
    });

    const latency = await received;
    results.push(latency);
  }

  dashWs.close(1000);
  androidWs.close(1000);

  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const min = Math.min(...results);
  const max = Math.max(...results);

  console.log(JSON.stringify({
    ok: true,
    rounds: ROUNDS,
    avgLatencyMs: Math.round(avg * 100) / 100,
    minLatencyMs: Math.round(min * 100) / 100,
    maxLatencyMs: Math.round(max * 100) / 100,
    allLatenciesMs: results.map((v) => Math.round(v * 100) / 100),
  }, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
