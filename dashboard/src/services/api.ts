const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data as T;
  }

  async login(email: string, password: string) {
    const result = await this.request<{
      token: string;
      userId: string;
      deviceId: string;
      role: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(result.token);
    localStorage.setItem('user_id', result.userId);
    localStorage.setItem('user_email', email);

    return result;
  }

  async register(email: string, password: string) {
    const result = await this.request<{
      token: string;
      userId: string;
      deviceId: string;
      role: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        device: {
          deviceId: `dashboard-${Date.now()}`,
          deviceName: 'Web Dashboard',
          model: 'Browser',
          osVersion: 'Web',
          sdkVersion: 0,
          manufacturer: 'Web',
        },
      }),
    });

    this.setToken(result.token);
    localStorage.setItem('user_id', result.userId);
    localStorage.setItem('user_email', email);

    return result;
  }

  async getDevices() {
    return this.request<{ devices: Array<{
      deviceId: string;
      userId: string;
      deviceName: string;
      model: string;
      osVersion: string;
      sdkVersion: number;
      manufacturer: string;
      role: 'OWNER' | 'CLIENT';
      status: 'online' | 'offline';
      isConnected: boolean;
      lastHeartbeat: number;
      registeredAt: string;
    }> }>('/api/devices');
  }

  async sendCommand(deviceId: string, type: string, payload: Record<string, unknown> = {}) {
    return this.request<{ success: boolean; commandId: string }>(`/api/devices/${deviceId}/command`, {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    });
  }

  async removeDevice(deviceId: string) {
    return this.request<{ success: boolean }>(`/api/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getApiUrl(): string {
    return API_URL;
  }
}

export const api = new ApiService();
