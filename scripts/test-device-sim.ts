import WebSocket from 'ws';

const baseUrl = (process.env.SIM_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const wsBaseUrl = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

type AuthResult = {
  token: string;
  userId: string;
  deviceId: string;
  role: string;
};

async function api<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data as T;
}

function connect(token: string, label: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws?token=${encodeURIComponent(token)}`);
    const timeout = setTimeout(() => reject(new Error(`${label} WebSocket timeout`)), 8000);

    ws.once('open', () => {
      clearTimeout(timeout);
      console.log(`${label} connected`);
      ws.send(JSON.stringify({ type: 'DEVICE_REGISTER', payload: { label } }));
      resolve(ws);
    });
    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function waitForBinary(ws: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dashboard did not receive binary frame')), 8000);
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        clearTimeout(timeout);
        resolve(Buffer.isBuffer(data) ? data.length : data.byteLength);
      }
    });
  });
}

async function main() {
  const suffix = Date.now();
  const email = `sim-${suffix}@hybridcontrol.test`;
  const password = `SimPass-${suffix}!`;

  const owner = await api<AuthResult>('/api/auth/register', {
    email,
    password,
    device: {
      deviceId: `dashboard-sim-${suffix}`,
      deviceName: 'Dashboard Simulator',
      model: 'Node',
      osVersion: process.version,
      sdkVersion: 0,
      manufacturer: 'Replit',
    },
  });

  const client = await api<AuthResult>('/api/auth/login', {
    email,
    password,
    device: {
      deviceId: `android-sim-${suffix}`,
      deviceName: 'Android Frame Simulator',
      model: 'Simulated Android',
      osVersion: 'API 34',
      sdkVersion: 34,
      manufacturer: 'Replit',
    },
  });

  const dashboardWs = await connect(owner.token, 'dashboard');
  const androidWs = await connect(client.token, 'android');
  const received = waitForBinary(dashboardWs);

  const onePixelJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ar//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
    'base64'
  );

  androidWs.send(onePixelJpeg, { binary: true });
  const byteLength = await received;

  androidWs.close(1000, 'simulation complete');
  dashboardWs.close(1000, 'simulation complete');

  console.log(JSON.stringify({
    ok: true,
    userId: owner.userId,
    ownerDeviceId: owner.deviceId,
    clientDeviceId: client.deviceId,
    receivedBinaryBytes: byteLength,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});