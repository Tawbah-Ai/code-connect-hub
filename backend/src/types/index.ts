export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface Device {
  deviceId: string;
  userId: string;
  deviceName: string;
  model: string;
  osVersion: string;
  sdkVersion: number;
  manufacturer: string;
  role: DeviceRole;
  status: DeviceStatus;
  lastHeartbeat: number;
  registeredAt: Date;
}

export enum DeviceRole {
  OWNER = 'OWNER',
  CLIENT = 'CLIENT',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export interface RemoteCommand {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
  fromDeviceId: string;
  targetDeviceId: string;
  userId: string;
  timestamp: number;
}

export interface CommandResult {
  commandId: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface HeartbeatPayload {
  deviceId: string;
  timestamp: number;
  batteryLevel?: number;
  isScreenOn?: boolean;
  isUserActive?: boolean;
}

export interface AuthPayload {
  userId: string;
  email: string;
  deviceId: string;
}

export interface WSMessage {
  type: string;
  payload?: Record<string, unknown>;
}

export interface DeviceRegistration {
  token: string;
  deviceId: string;
  deviceName: string;
  model: string;
  osVersion: string;
  sdkVersion: number;
  manufacturer: string;
}
