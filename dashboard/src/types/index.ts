export interface Device {
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
}

export interface AuthResponse {
  token: string;
  userId: string;
  deviceId: string;
  role: 'OWNER' | 'CLIENT';
}

export interface CommandPayload {
  type: string;
  payload?: Record<string, unknown>;
}

export interface CommandResult {
  commandId: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
  fromDeviceId?: string;
}

export type ControlMode = 'COMMAND' | 'TOUCH' | 'HYBRID';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'command' | 'result' | 'error' | 'info';
  message: string;
  data?: unknown;
}
