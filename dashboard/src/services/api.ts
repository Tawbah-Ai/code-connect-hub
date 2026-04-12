import type { Device, Command, PairingCode } from '../types';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '/backend-api';

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('hc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers as Record<string, string> || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  return data as T;
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

interface WSMessage {
  type: string;
  payload?: Record<string, unknown>;
}

type WSListener = (msg: WSMessage) => void;
type BinaryListener = (frame: ArrayBuffer) => void;

class BackendWS {
  private ws: WebSocket | null = null;
  private listeners: WSListener[] = [];
  private binaryListeners: BinaryListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;
  private shouldConnect = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  connect() {
    this.shouldConnect = true;
    this._connect();
  }

  private _connect() {
    const token = localStorage.getItem('hc_token');
    if (!token || !this.shouldConnect) return;

    const isAbsolute = BACKEND.startsWith('http');
    const wsBase = isAbsolute
      ? BACKEND.replace(/^http/, 'ws')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/backend-api`;

    const url = `${wsBase}/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectDelay = 1000;
      this._startHeartbeat();
    };

    this.ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.binaryListeners.forEach((l) => l(e.data as ArrayBuffer));
      } else {
        try {
          const msg = JSON.parse(e.data as string) as WSMessage;
          this.listeners.forEach((l) => l(msg));
        } catch {}
      }
    };

    this.ws.onclose = () => {
      this._stopHeartbeat();
      if (this.shouldConnect) this._scheduleReconnect();
    };

    this.ws.onerror = () => { this.ws?.close(); };
  }

  private _scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      this._connect();
    }, this.reconnectDelay);
  }

  private _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'HEARTBEAT', payload: { timestamp: Date.now() } }));
      }
    }, 12000);
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  send(msg: WSMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  onMessage(listener: WSListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  onBinaryFrame(listener: BinaryListener): () => void {
    this.binaryListeners.push(listener);
    return () => { this.binaryListeners = this.binaryListeners.filter((l) => l !== listener); };
  }

  disconnect() {
    this.shouldConnect = false;
    this._stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new BackendWS();

// ─── Auth ─────────────────────────────────────────────────────────────────────

interface AuthResult {
  token: string;
  userId: string;
  deviceId: string;
  role: string;
}

// ─── Backend REST + WebSocket service (replaces Supabase) ─────────────────────

class BackendService {

  async register(email: string, password: string): Promise<void> {
    const deviceId = `dashboard-${this._uid()}`;
    const result = await apiFetch<AuthResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email, password,
        device: {
          deviceId, deviceName: 'Web Dashboard', model: 'Browser',
          osVersion: navigator.userAgent.substring(0, 80),
          sdkVersion: 0, manufacturer: 'Web',
        },
      }),
    });
    this._saveSession(email, result);
    wsClient.connect();
  }

  async login(email: string, password: string): Promise<void> {
    const stored = localStorage.getItem('hc_deviceId') || `dashboard-${this._uid()}`;
    const result = await apiFetch<AuthResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email, password,
        device: {
          deviceId: stored, deviceName: 'Web Dashboard', model: 'Browser',
          osVersion: navigator.userAgent.substring(0, 80),
          sdkVersion: 0, manufacturer: 'Web',
        },
      }),
    });
    this._saveSession(email, result);
    wsClient.connect();
  }

  async logout(): Promise<void> {
    wsClient.disconnect();
    ['hc_token','hc_userId','hc_deviceId','hc_role','hc_email'].forEach((k) => localStorage.removeItem(k));
  }

  isLoggedIn(): boolean { return !!localStorage.getItem('hc_token'); }
  getUserId(): string | null { return localStorage.getItem('hc_userId'); }
  getEmail(): string | null { return localStorage.getItem('hc_email'); }
  getRole(): string | null { return localStorage.getItem('hc_role'); }

  // ─── Devices ──────────────────────────────────────────────────────────────

  async getDevices(): Promise<Device[]> {
    const data = await apiFetch<{ devices: Device[] }>('/api/devices');
    return data.devices || [];
  }

  async removeDevice(deviceId: string): Promise<void> {
    await apiFetch(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async sendCommand(deviceId: string, type: string, payload: Record<string, unknown> = {}): Promise<{ commandId: string }> {
    const data = await apiFetch<{ success: boolean; commandId: string }>(
      `/api/devices/${encodeURIComponent(deviceId)}/command`,
      { method: 'POST', body: JSON.stringify({ type, payload }) }
    );
    return { commandId: data.commandId };
  }

  // ─── Pairing ──────────────────────────────────────────────────────────────

  async createPairingCode(): Promise<PairingCode> {
    const userId = this.getUserId();
    if (!userId) throw new Error('Not authenticated');
    return apiFetch<PairingCode>('/api/pairing/generate', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  // ─── Real-time subscriptions (via WebSocket) ──────────────────────────────

  subscribeToDevices(_userId: string, callback: (devices: Device[]) => void): () => void {
    const unsub = wsClient.onMessage((msg) => {
      if (['DEVICE_STATUS_UPDATE','REGISTERED','HEARTBEAT','COMMAND_RESULT'].includes(msg.type)) {
        this.getDevices().then(callback).catch(() => {});
      }
    });
    return unsub;
  }

  subscribeToCommands(_deviceId: string, callback: (result: Command) => void): () => void {
    return wsClient.onMessage((msg) => {
      if (msg.type === 'COMMAND_RESULT' && msg.payload) {
        callback(msg.payload as unknown as Command);
      }
    });
  }

  subscribeToScreenStream(callback: (frame: ArrayBuffer) => void): () => void {
    return wsClient.onBinaryFrame(callback);
  }

  async getLogs(_deviceId: string): Promise<unknown[]> { return []; }
  async addLog(_deviceId: string | null, _msg: string, _level?: string): Promise<void> {}
  unsubscribeAll(): void {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _saveSession(email: string, result: AuthResult): void {
    localStorage.setItem('hc_token', result.token);
    localStorage.setItem('hc_userId', result.userId);
    localStorage.setItem('hc_deviceId', result.deviceId);
    localStorage.setItem('hc_role', result.role);
    localStorage.setItem('hc_email', email);
  }

  private _uid(): string { return Math.random().toString(36).slice(2, 10); }
}

export const api = new BackendService();
